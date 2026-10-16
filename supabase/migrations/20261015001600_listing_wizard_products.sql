begin;
-- Existing catalog records/imports remain trusted reference data. New seller
-- suggestions must be approved before they become shared catalog records.
create function public.wizard_can_manage(p_facility_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.facility_can_publish(p_facility_id) and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null);
$$;
revoke all on function public.wizard_can_manage(uuid) from public,anon;
grant execute on function public.wizard_can_manage(uuid) to authenticated;

create table public.product_submissions (
 id uuid primary key,facility_id uuid not null references public.facilities,requested_by uuid not null references auth.users,
 manufacturer text not null check(length(btrim(manufacturer)) between 2 and 120),
 catalog_number text not null check(length(btrim(catalog_number)) between 1 and 100),
 name text not null check(length(btrim(name)) between 2 and 180),category text not null check(length(btrim(category)) between 2 and 100),
 description text not null default '' check(length(description)<=4000),product_kind text not null check(product_kind in ('capital','disposable')),
 normalized_manufacturer text generated always as(public.normalize_identity(manufacturer)) stored,
 normalized_catalog_number text generated always as(public.normalize_identity(catalog_number)) stored,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),revision integer not null default 1,
 product_id uuid references public.products,reviewed_by uuid references auth.users,review_note text not null default '' check(length(review_note)<=1000),
 created_at timestamptz not null default clock_timestamp(),reviewed_at timestamptz
);
alter table public.product_submissions enable row level security;
create policy product_submissions_read on public.product_submissions for select to authenticated
 using(public.wizard_can_manage(facility_id) or public.is_platform_administrator());
revoke all on public.product_submissions from public,anon,authenticated;
grant select on public.product_submissions to authenticated;
create unique index one_pending_product_submission on public.product_submissions(facility_id,normalized_manufacturer,normalized_catalog_number) where status='pending';

create function public.submit_product_reference(p_id uuid,p_facility_id uuid,p_product jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.product_submissions;body jsonb;
begin
 perform private.require_inventory_manager(p_facility_id);
 if p_id is null or p_product is null or jsonb_typeof(p_product)<>'object' then raise exception 'Enter product information.' using errcode='22023'; end if;
 body:=jsonb_build_object('manufacturer',btrim(p_product->>'manufacturer'),'catalog_number',btrim(p_product->>'catalog_number'),
  'name',btrim(p_product->>'name'),'category',btrim(p_product->>'category'),'description',coalesce(p_product->>'description',''),'product_kind',p_product->>'product_kind');
 if length(coalesce(body->>'manufacturer','')) not between 2 and 120 or length(coalesce(body->>'catalog_number','')) not between 1 and 100
  or length(coalesce(body->>'name','')) not between 2 and 180 or length(coalesce(body->>'category','')) not between 2 and 100
  or length(body->>'description')>4000 or coalesce(body->>'product_kind','') not in ('capital','disposable') then raise exception 'Complete the manufacturer, catalog/SKU, name, category and product type within the displayed limits.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('product-submit:'||p_id::text,0));
 select * into r from public.product_submissions where id=p_id;
 if found then
  if r.facility_id<>p_facility_id or r.requested_by<>auth.uid() or body<>jsonb_build_object('manufacturer',r.manufacturer,'catalog_number',r.catalog_number,'name',r.name,'category',r.category,'description',r.description,'product_kind',r.product_kind) then raise exception 'Submission changed. Reload before submitting again.' using errcode='42501'; end if;
  return r.id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('product-facility:'||p_facility_id::text,0));
 select * into r from public.product_submissions where facility_id=p_facility_id and status='pending'
  and normalized_manufacturer=public.normalize_identity(body->>'manufacturer') and normalized_catalog_number=public.normalize_identity(body->>'catalog_number');
 if found then return r.id; end if;
 if (select count(*) from public.product_submissions where facility_id=p_facility_id and created_at>clock_timestamp()-interval '1 day')>=20 then raise exception 'Product submission limit reached. Try again tomorrow.' using errcode='22023'; end if;
 insert into public.product_submissions(id,facility_id,requested_by,manufacturer,catalog_number,name,category,description,product_kind)
 values(p_id,p_facility_id,auth.uid(),body->>'manufacturer',body->>'catalog_number',body->>'name',body->>'category',body->>'description',body->>'product_kind');
 return p_id;
end;$$;
revoke all on function public.submit_product_reference(uuid,uuid,jsonb) from public,anon;
grant execute on function public.submit_product_reference(uuid,uuid,jsonb) to authenticated;

create function public.review_product_reference(p_id uuid,p_revision integer,p_decision text,p_note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.product_submissions;mid uuid;pid uuid;
begin
 if auth.uid() is null or not public.is_platform_administrator() or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Platform administrator permission is required.' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('approved','rejected') or length(coalesce(p_note,''))>1000 then raise exception 'Choose approve or reject.' using errcode='22023'; end if;
 select * into r from public.product_submissions where id=p_id for update;
 if r.id is null or r.status<>'pending' or r.revision is distinct from p_revision then raise exception 'This submission changed. Refresh before reviewing.' using errcode='22023'; end if;
 if p_decision='approved' then
  insert into public.manufacturers(name) values(r.manufacturer) on conflict(normalized_name) do nothing;
  select id into mid from public.manufacturers where normalized_name=r.normalized_manufacturer;
  insert into public.products(manufacturer_id,catalog_number,name,category,description,product_kind,reference_source)
   values(mid,r.catalog_number,r.name,r.category,r.description,r.product_kind,'Administrator-approved seller submission')
   on conflict(manufacturer_id,normalized_catalog_number) do nothing;
  select id into pid from public.products where manufacturer_id=mid and normalized_catalog_number=r.normalized_catalog_number;
 end if;
 update public.product_submissions set status=p_decision,product_id=pid,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=coalesce(p_note,''),revision=revision+1 where id=r.id;
 return pid;
end;$$;
revoke all on function public.review_product_reference(uuid,integer,text,text) from public,anon;
grant execute on function public.review_product_reference(uuid,integer,text,text) to authenticated;

-- Close the old propose-and-list bypass. Retain normalized resolution of
-- already approved catalog identities for older clients, without edits.
alter function public.create_inventory_listing(uuid,jsonb,jsonb) set schema private;
alter function private.create_inventory_listing(uuid,jsonb,jsonb) rename to create_inventory_listing_internal;
revoke all on function private.create_inventory_listing_internal(uuid,jsonb,jsonb) from public,anon,authenticated;
create function public.create_inventory_listing(p_facility_id uuid,p_product jsonb,p_inventory jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
 perform private.require_inventory_manager(p_facility_id);
 if p_product->>'id' is not null then select id into pid from public.products where id=(p_product->>'id')::uuid;
 else select p.id into pid from public.products p join public.manufacturers m on m.id=p.manufacturer_id
  where m.normalized_name=public.normalize_identity(p_product->>'manufacturer') and p.normalized_catalog_number=public.normalize_identity(p_product->>'catalog_number'); end if;
 if pid is null then raise exception 'Submit this new product for administrator approval before creating a listing.' using errcode='42501'; end if;
 return private.create_inventory_listing_internal(p_facility_id,jsonb_build_object('id',pid),p_inventory);
end;$$;
revoke all on function public.create_inventory_listing(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_inventory_listing(uuid,jsonb,jsonb) to authenticated;

-- Incomplete setup lives separately; never invent placeholder stock or prices.
create table public.listing_wizard_drafts (
 id uuid primary key,facility_id uuid not null references public.facilities,created_by uuid not null references auth.users,
 product_id uuid not null references public.products,data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object' and length(data::text)<=20000),
 step integer not null default 2 check(step between 2 and 4),revision integer not null default 1,
 listing_id uuid unique references public.listings,listing_revision integer,prepared_data jsonb,
 published_at timestamptz,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
alter table public.listing_wizard_drafts enable row level security;
create policy wizard_drafts_read on public.listing_wizard_drafts for select to authenticated using(public.wizard_can_manage(facility_id));
revoke all on public.listing_wizard_drafts from public,anon,authenticated;
grant select on public.listing_wizard_drafts to authenticated;
create index wizard_drafts_facility on public.listing_wizard_drafts(facility_id,updated_at desc);

create function public.save_listing_wizard(p_id uuid,p_facility_id uuid,p_product_id uuid,p_revision integer,p_data jsonb,p_step integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.listing_wizard_drafts;k text;v jsonb;
begin
 perform private.require_inventory_manager(p_facility_id);
 if p_id is null or p_step is null or p_step not between 2 and 4 or p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>20000 then raise exception 'Invalid draft details.' using errcode='22023'; end if;
 for k,v in select key,value from jsonb_each(p_data) loop
  if k not in ('quantity','quantity_unit','units_per_package','price_usd','inventory_kind','price_negotiable','procedure_type','condition','expiration','sterile','single_use','packaging','notes')
    or jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'Invalid draft field.' using errcode='22023'; end if;
 end loop;
 if not exists(select 1 from public.products where id=p_product_id) then raise exception 'Choose an approved catalog product.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('wizard:'||p_id::text,0));
 select * into d from public.listing_wizard_drafts where id=p_id for update;
 if found then
  if d.facility_id<>p_facility_id then raise exception 'Draft unavailable.' using errcode='42501'; end if;
  if d.revision is distinct from p_revision or d.published_at is not null then raise exception 'Draft changed. Reload before saving.' using errcode='22023'; end if;
  if d.listing_id is not null and (d.product_id<>p_product_id or not exists(select 1 from public.listings where id=d.listing_id and status='draft' and deleted_at is null)) then raise exception 'This listing identity or status changed. Open its listing editor.' using errcode='22023'; end if;
  if p_step>2 and d.listing_id is null then raise exception 'Complete product details before adding photos.' using errcode='22023'; end if;
  update public.listing_wizard_drafts set product_id=p_product_id,data=p_data,step=p_step,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into d;
 else
  if p_revision is distinct from 0 or p_step<>2 then raise exception 'Start with product selection and details.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wizard-facility:'||p_facility_id::text,0));
  if (select count(*) from public.listing_wizard_drafts where facility_id=p_facility_id and listing_id is null and published_at is null)>=100 then raise exception 'Finish or remove existing setup drafts before adding more (100 per facility).' using errcode='22023'; end if;
  insert into public.listing_wizard_drafts(id,facility_id,created_by,product_id,data) values(p_id,p_facility_id,auth.uid(),p_product_id,p_data) returning * into d;
 end if;
 return to_jsonb(d);
end;$$;

create function public.prepare_listing_wizard(p_id uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.listing_wizard_drafts;i jsonb;lid uuid;
begin
 select * into d from public.listing_wizard_drafts where id=p_id;
 perform private.require_inventory_manager(d.facility_id);
 select * into d from public.listing_wizard_drafts where id=p_id for update;
 if d.revision is distinct from p_revision or d.published_at is not null then raise exception 'Draft changed. Reload before continuing.' using errcode='22023'; end if;
 if coalesce(d.data->>'inventory_kind','') not in ('capital','disposable') then raise exception 'Choose capital equipment or disposable supplies before continuing.' using errcode='22023'; end if;
 i:=d.data||jsonb_build_object('status','draft','sterile',coalesce(d.data->>'sterile','no')='yes','single_use',coalesce(d.data->>'single_use','yes')='yes','price_negotiable',coalesce(d.data->>'price_negotiable','no')='yes');
 if d.listing_id is null then
  lid:=public.create_inventory_draft(d.id,d.facility_id,jsonb_build_object('id',d.product_id),i);
 else
  if not exists(select 1 from public.listings where id=d.listing_id and status='draft' and deleted_at is null) then raise exception 'This listing is no longer a draft.' using errcode='22023'; end if;
  lid:=public.update_inventory_listing(d.listing_id,d.listing_revision,i);
 end if;
 update public.listing_wizard_drafts set listing_id=lid,listing_revision=(select revision from public.listings where id=lid),prepared_data=data,step=3,revision=revision+1,updated_at=clock_timestamp() where id=d.id returning * into d;
 return to_jsonb(d);
end;$$;

create function public.publish_listing_wizard(p_id uuid,p_revision integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.listing_wizard_drafts;
begin
 select * into d from public.listing_wizard_drafts where id=p_id;
 perform private.require_inventory_manager(d.facility_id);
 select * into d from public.listing_wizard_drafts where id=p_id for update;
 if d.published_at is not null then return d.listing_id; end if;
 if d.revision is distinct from p_revision or d.listing_id is null or d.prepared_data is distinct from d.data or d.step<>4 then raise exception 'Complete details and review the latest draft before publishing.' using errcode='22023'; end if;
 if not exists(select 1 from public.listings where id=d.listing_id and status='draft' and deleted_at is null) then raise exception 'Listing status changed. Reload before publishing.' using errcode='22023'; end if;
 if exists(select 1 from public.listing_photos where listing_id=d.listing_id and state<>'ready') then raise exception 'Finish or remove unfinished photo uploads before publishing.' using errcode='22023'; end if;
 perform public.update_inventory_listing(d.listing_id,d.listing_revision,jsonb_build_object('status','active'));
 update public.listing_wizard_drafts set published_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=d.id;
 return d.listing_id;
end;$$;

create function public.discard_listing_setup(p_id uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare d public.listing_wizard_drafts;
begin
 select * into d from public.listing_wizard_drafts where id=p_id;
 perform private.require_inventory_manager(d.facility_id);
 select * into d from public.listing_wizard_drafts where id=p_id for update;
 if d.revision is distinct from p_revision or d.listing_id is not null then raise exception 'Draft changed or has inventory/photos. Use the listing editor to delete it.' using errcode='22023'; end if;
 delete from public.listing_wizard_drafts where id=d.id;
end;$$;
revoke all on function public.save_listing_wizard(uuid,uuid,uuid,integer,jsonb,integer),public.prepare_listing_wizard(uuid,integer),public.publish_listing_wizard(uuid,integer),public.discard_listing_setup(uuid,integer) from public,anon;
grant execute on function public.save_listing_wizard(uuid,uuid,uuid,integer,jsonb,integer),public.prepare_listing_wizard(uuid,integer),public.publish_listing_wizard(uuid,integer),public.discard_listing_setup(uuid,integer) to authenticated;
commit;
