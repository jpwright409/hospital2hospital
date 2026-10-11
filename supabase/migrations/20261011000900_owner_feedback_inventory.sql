begin;
alter table public.facilities drop constraint facilities_facility_type_check;
alter table public.facilities add constraint facilities_facility_type_check check(facility_type in ('hospital','surgery_center','surgical_hospital','physician_office','other'));
alter table public.products add column product_kind text check(product_kind in ('capital','disposable'));
alter table public.listings add column price_negotiable boolean not null default false;
alter table public.listings add column procedure_type text not null default 'Other' check(procedure_type in ('General Surgery','ENT','Orthopedics','Plastic Surgery','Urology','Gynecology / OBGYN','Cardiovascular','Endoscopy / GI','Ophthalmology','Neurosurgery','Wound Care','Other'));
alter table public.listings add column inventory_kind text not null default 'unclassified' check(inventory_kind in ('capital','disposable','unclassified'));
alter table public.listings add column deleted_at timestamptz;
alter table public.listings add constraint deleted_listing_inactive check(deleted_at is null or status='inactive');
create or replace function public.onboard_facility(p_name text, p_city text, p_state text, p_facility_type text, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_facility uuid;
  v_owner uuid;
begin
  if v_user is null or not exists(select 1 from auth.users where id = v_user and email_confirmed_at is not null) then
    raise exception 'A confirmed account is required.' using errcode = '42501';
  end if;
  if p_request_id is null or p_name is null or char_length(btrim(p_name)) not between 2 and 160
    or p_city is null or char_length(btrim(p_city)) not between 2 and 100
    or p_state is null or upper(btrim(p_state)) !~ '^[A-Z]{2}$'
    or p_facility_type is null or p_facility_type not in ('hospital','surgery_center','surgical_hospital','physician_office','other') then
    raise exception 'Enter a facility name, city, two-letter state, and valid facility type.' using errcode = '22023';
  end if;
  -- Idempotent submission: retrying one form never creates two facilities.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select id, owner_user_id into v_facility, v_owner from public.facilities where onboarding_request_id = p_request_id;
  if v_facility is not null then
    if v_owner <> v_user then raise exception 'This onboarding request is unavailable.' using errcode = '42501'; end if;
    return v_facility;
  end if;
  insert into public.facilities(name, city, state, facility_type, owner_user_id, onboarding_request_id)
    values (btrim(p_name), btrim(p_city), upper(btrim(p_state)), p_facility_type, v_user, p_request_id)
    returning id into v_facility;
  insert into public.facility_memberships(facility_id, user_id, role) values (v_facility, v_user, 'owner');
  insert into public.profiles(id) values (v_user) on conflict (id) do nothing;
  update public.profiles set active_facility_id = v_facility where id = v_user;
  return v_facility;
end;
$$;
create or replace function public.create_inventory_listing(p_facility_id uuid, p_product jsonb, p_inventory jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare mid uuid; pid uuid; lid uuid;
begin
  perform private.require_inventory_manager(p_facility_id);
  if (p_inventory->>'price_usd')::numeric <> round((p_inventory->>'price_usd')::numeric,2) then
    raise exception 'USD prices must have at most two decimal places.' using errcode='22023';
  end if;
  if p_product->>'id' is not null then
    select id into pid from public.products where id=(p_product->>'id')::uuid;
    if pid is null then raise exception 'Select an existing product or propose a new reference.' using errcode='22023'; end if;
  else
    insert into public.manufacturers(name) values(btrim(p_product->>'manufacturer'))
      on conflict(normalized_name) do nothing;
    select id into mid from public.manufacturers where normalized_name=public.normalize_identity(p_product->>'manufacturer');
    insert into public.products(manufacturer_id,catalog_number,name,category,description,product_kind)
      values(mid,btrim(p_product->>'catalog_number'),btrim(p_product->>'name'),btrim(p_product->>'category'),coalesce(p_product->>'description',''),nullif(p_product->>'product_kind',''))
      on conflict(manufacturer_id,normalized_catalog_number) do nothing;
    select id into pid from public.products where manufacturer_id=mid and normalized_catalog_number=public.normalize_identity(p_product->>'catalog_number');
  end if;
  insert into public.listings(facility_id,product_id,quantity,quantity_unit,units_per_package,price_usd,condition,expiration,sterile,single_use,packaging,notes,status,price_negotiable,procedure_type,inventory_kind)
    values(p_facility_id,pid,(p_inventory->>'quantity')::integer,p_inventory->>'quantity_unit',
      (p_inventory->>'units_per_package')::integer,(p_inventory->>'price_usd')::numeric,p_inventory->>'condition',
      nullif(p_inventory->>'expiration','')::date,(p_inventory->>'sterile')::boolean,(p_inventory->>'single_use')::boolean,
      coalesce(p_inventory->>'packaging',''),coalesce(p_inventory->>'notes',''),coalesce(p_inventory->>'status','active'),coalesce((p_inventory->>'price_negotiable')::boolean,false),coalesce(p_inventory->>'procedure_type','Other'),coalesce(p_inventory->>'inventory_kind',(select product_kind from public.products where id=pid),'unclassified')) returning id into lid;
  return lid;
end;
$$;
create or replace function public.update_inventory_listing(p_listing_id uuid, p_revision integer, p_inventory jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.listings;
begin
  select * into l from public.listings where id=p_listing_id;
  perform private.require_inventory_manager(l.facility_id);
  select * into l from public.listings where id=p_listing_id for update;
  if l.deleted_at is not null then raise exception 'Deleted listings cannot be edited or reactivated.' using errcode='42501'; end if;
  if l.revision is distinct from p_revision then raise exception 'This listing changed. Reload before saving.' using errcode='22023'; end if;
  if p_inventory ? 'facility_id' or p_inventory ? 'product_id' then
    raise exception 'Listing facility and product identity cannot be changed.' using errcode='42501';
  end if;
  if p_inventory ? 'price_usd' and (p_inventory->>'price_usd')::numeric <> round((p_inventory->>'price_usd')::numeric,2) then
    raise exception 'USD prices must have at most two decimal places.' using errcode='22023';
  end if;
  update public.listings set quantity=coalesce((p_inventory->>'quantity')::integer,l.quantity),
    quantity_unit=coalesce(p_inventory->>'quantity_unit',l.quantity_unit),
    units_per_package=coalesce((p_inventory->>'units_per_package')::integer,l.units_per_package),
    price_usd=coalesce((p_inventory->>'price_usd')::numeric,l.price_usd),
    condition=coalesce(p_inventory->>'condition',l.condition),
    expiration=case when p_inventory ? 'expiration' then nullif(p_inventory->>'expiration','')::date else l.expiration end,
    sterile=coalesce((p_inventory->>'sterile')::boolean,l.sterile),single_use=coalesce((p_inventory->>'single_use')::boolean,l.single_use),
    packaging=coalesce(p_inventory->>'packaging',l.packaging),notes=coalesce(p_inventory->>'notes',l.notes),
    price_negotiable=coalesce((p_inventory->>'price_negotiable')::boolean,l.price_negotiable),
    procedure_type=coalesce(p_inventory->>'procedure_type',l.procedure_type),
    inventory_kind=coalesce(p_inventory->>'inventory_kind',l.inventory_kind),
    status=coalesce(p_inventory->>'status',l.status),revision=l.revision+1,updated_at=now() where id=p_listing_id;
  return p_listing_id;
end;
$$;
create or replace view public.marketplace_inventory with (security_invoker=true) as
select l.id,l.facility_id,l.product_id,l.quantity,l.quantity_unit,l.units_per_package,l.price_usd,l.currency,l.condition,l.expiration,l.sterile,l.single_use,l.packaging,l.notes,l.status,l.revision,l.created_at,l.updated_at,p.name,p.catalog_number,p.category,p.description,m.name as manufacturer,m.id as manufacturer_id,
public.marketplace_facility(l.facility_id) as facility,l.price_negotiable,l.procedure_type,l.deleted_at,p.product_kind,l.inventory_kind
from public.listings l join public.products p on p.id=l.product_id join public.manufacturers m on m.id=p.manufacturer_id;

create or replace function public.search_inventory(p_query text default '',p_category text default '',p_manufacturer text default '',
  p_location text default '',p_sort text default 'newest',p_page integer default 1,p_page_size integer default 12,
  p_facility_id uuid default null,p_saved boolean default false,p_status text default '') returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_page is null or p_page_size is null or p_query is null or p_sort is null
    or p_page not between 1 and 100000 or p_page_size not between 1 and 48 or length(p_query)>200
    or p_sort not in ('newest','price_low','price_high') then
    raise exception 'Invalid search or pagination. Reset filters and retry.' using errcode='22023';
  end if;
  if p_facility_id is not null and not public.inventory_can_view(p_facility_id) then
    raise exception 'Active owner or inventory editor membership required to view seller inventory.' using errcode='42501';
  end if;
  if p_saved and auth.uid() is null then raise exception 'Log in to view saved listings.' using errcode='42501'; end if;
  with filtered as (
    select v.* from public.marketplace_inventory v
    where v.deleted_at is null and (case when p_facility_id is not null then v.facility_id=p_facility_id and (p_status='' or v.status=p_status)
      else v.status='active' and public.facility_is_public(v.facility_id) end)
      and (p_category='' or v.category=p_category)
      and (p_manufacturer='' or v.manufacturer_id::text=p_manufacturer)
      and (p_location='' or strpos(lower((v.facility->>'city')||', '||(v.facility->>'state')),lower(p_location))>0)
      and not exists(select 1 from regexp_split_to_table(lower(btrim(p_query)),'\s+') token
        where token<>'' and strpos(lower(v.name||' '||v.manufacturer||' '||v.catalog_number||' '||v.description),token)=0)
      and (not p_saved or public.is_listing_saved(v.id))
  ), paged as (
    select * from filtered order by
      case when p_sort='price_low' then price_usd end asc,
      case when p_sort='price_high' then price_usd end desc,created_at desc,id
    limit p_page_size offset ((p_page::bigint-1)*p_page_size)
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged) order by
      case when p_sort='price_low' then price_usd end asc,
      case when p_sort='price_high' then price_usd end desc,created_at desc,id) from paged),'[]'::jsonb),
    'total',(select count(*) from filtered),'page',p_page,'page_size',p_page_size) into result;
  return result;
end;
$$;
create or replace function public.search_inventory_v2(p_query text default '',p_category text default '',p_manufacturer text default '',
  p_location text default '',p_sort text default 'newest',p_page integer default 1,p_page_size integer default 12,
  p_facility_id uuid default null,p_saved boolean default false,p_status text default '',p_seller_facility_id uuid default null,p_procedure_type text default '',p_product_kind text default '') returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_page is null or p_page_size is null or p_query is null or p_sort is null
    or p_page not between 1 and 100000 or p_page_size not between 1 and 48 or length(p_query)>200
    or p_sort not in ('newest','price_low','price_high') then
    raise exception 'Invalid search or pagination. Reset filters and retry.' using errcode='22023';
  end if;
  if p_facility_id is not null and not public.inventory_can_view(p_facility_id) then
    raise exception 'Active owner or inventory editor membership required to view seller inventory.' using errcode='42501';
  end if;
  if p_saved and auth.uid() is null then raise exception 'Log in to view saved listings.' using errcode='42501'; end if;
  with filtered as (
    select v.* from public.marketplace_inventory v
    where v.deleted_at is null and (case when p_facility_id is not null then v.facility_id=p_facility_id and (p_status='' or v.status=p_status)
      else v.status='active' and public.facility_is_public(v.facility_id) end)
      and (p_seller_facility_id is null or v.facility_id=p_seller_facility_id)
      and (p_procedure_type='' or v.procedure_type=p_procedure_type)
      and (p_product_kind='' or v.inventory_kind=p_product_kind)
      and (p_category='' or v.category=p_category)
      and (p_manufacturer='' or v.manufacturer_id::text=p_manufacturer)
      and (p_location='' or strpos(lower((v.facility->>'city')||', '||(v.facility->>'state')),lower(p_location))>0)
      and not exists(select 1 from regexp_split_to_table(lower(btrim(p_query)),'\s+') token
        where token<>'' and strpos(lower(v.name||' '||v.manufacturer||' '||v.catalog_number||' '||v.description),token)=0)
      and (not p_saved or public.is_listing_saved(v.id))
  ), paged as (
    select * from filtered order by
      case when p_sort='price_low' then price_usd end asc,
      case when p_sort='price_high' then price_usd end desc,created_at desc,id
    limit p_page_size offset ((p_page::bigint-1)*p_page_size)
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged) order by
      case when p_sort='price_low' then price_usd end asc,
      case when p_sort='price_high' then price_usd end desc,created_at desc,id) from paged),'[]'::jsonb),
    'total',(select count(*) from filtered),'page',p_page,'page_size',p_page_size) into result;
  return result;
end;
$$;
revoke all on function public.search_inventory_v2(text,text,text,text,text,integer,integer,uuid,boolean,text,uuid,text,text) from public;
grant execute on function public.search_inventory_v2(text,text,text,text,text,integer,integer,uuid,boolean,text,uuid,text,text) to anon,authenticated;
create or replace function private.notify_saved_listing_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare delta jsonb:='{}'::jsonb; field text; before_values jsonb; after_values jsonb;
begin
  if not public.facility_is_public(new.facility_id) or (old.status<>'active' and new.status<>'active') then return new; end if;
  if old.status is distinct from new.status then delta:=jsonb_build_object('status',new.status); end if;
  if new.status='active' then
    before_values:=to_jsonb(old);after_values:=to_jsonb(new);
    foreach field in array array['quantity','quantity_unit','units_per_package','price_usd','price_negotiable','procedure_type','inventory_kind','condition','expiration','sterile','single_use','packaging'] loop
      if before_values->field is distinct from after_values->field then
        delta:=delta||jsonb_build_object(field,after_values->field);
      end if;
    end loop;
    -- Do not duplicate free-form seller notes into a notification history.
    if old.notes is distinct from new.notes then delta:=delta||jsonb_build_object('details_updated',true); end if;
  end if;
  if delta='{}'::jsonb then return new; end if;
  insert into public.saved_listing_updates(user_id,listing_id,listing_revision,product_name,catalog_number,changes)
    select s.user_id,new.id,new.revision,p.name,p.catalog_number,delta
    from public.saved_listings s join public.products p on p.id=new.product_id
    where s.listing_id=new.id
    on conflict(user_id,listing_id,listing_revision) do nothing;
  return new;
end;
$$;
create function public.delete_inventory_listing(p_id uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare l public.listings;
begin
 select * into l from public.listings where id=p_id;
 perform private.require_inventory_manager(l.facility_id);
 select * into l from public.listings where id=p_id for update;
 if l.revision is distinct from p_revision then raise exception 'Listing changed. Reload before deleting.' using errcode='22023'; end if;
 update public.listings set deleted_at=coalesce(deleted_at,clock_timestamp()),status='inactive',revision=revision+1,updated_at=clock_timestamp() where id=p_id;
end;$$;
revoke all on function public.delete_inventory_listing(uuid,integer) from public,anon;
grant execute on function public.delete_inventory_listing(uuid,integer) to authenticated;
create or replace function public.inventory_filter_options() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object('manufacturers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.manufacturers),'[]'::jsonb),
'categories',coalesce((select jsonb_agg(category order by category) from(select distinct category from public.products)c),'[]'::jsonb),
'facilities',coalesce((select jsonb_agg(facility order by facility->>'name') from(select distinct public.marketplace_facility(facility_id) as facility from public.listings where status='active' and deleted_at is null and public.facility_is_public(facility_id))f),'[]'::jsonb));$$;

commit;
