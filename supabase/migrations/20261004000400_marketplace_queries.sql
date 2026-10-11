-- Deliberately narrow facility projection; private facility rows stay private.
begin;
create function public.marketplace_facility(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',id,'name',name,'city',city,'state',state,'facility_type',facility_type)
  from public.facilities where id=p_id and (status='approved' or public.inventory_can_view(id));
$$;
revoke all on function public.marketplace_facility(uuid) from public;
grant execute on function public.marketplace_facility(uuid) to anon,authenticated;
create view public.marketplace_inventory with (security_invoker=true) as
  select l.*,p.name,p.catalog_number,p.category,p.description,m.name as manufacturer,m.id as manufacturer_id,
    public.marketplace_facility(l.facility_id) as facility
  from public.listings l join public.products p on p.id=l.product_id join public.manufacturers m on m.id=p.manufacturer_id;
grant select on public.marketplace_inventory to anon,authenticated;
create function public.search_inventory(p_query text default '',p_category text default '',p_manufacturer text default '',
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
    where (case when p_facility_id is not null then v.facility_id=p_facility_id and (p_status='' or v.status=p_status)
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
-- Saved predicates do not require anonymous access to the private table:
-- use a private-by-construction capability helper, rather than granting anon SELECT.
create function public.is_listing_saved(p_listing_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.saved_listings where user_id=auth.uid() and listing_id=p_listing_id);
$$;
revoke all on function public.is_listing_saved(uuid) from public;
grant execute on function public.is_listing_saved(uuid) to anon,authenticated;
revoke all on function public.search_inventory(text,text,text,text,text,integer,integer,uuid,boolean,text) from public;
grant execute on function public.search_inventory(text,text,text,text,text,integer,integer,uuid,boolean,text) to anon,authenticated;
create function public.inventory_filter_options() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('manufacturers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.manufacturers),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(category order by category) from (select distinct category from public.products) c),'[]'::jsonb));
$$;
create function public.unavailable_saved_listings() returns jsonb
language sql stable security definer set search_path = '' as $$
  -- Only the actor's saved IDs are returned. No unavailable product/facility data.
  select coalesce(jsonb_agg(jsonb_build_object('listing_id',s.listing_id) order by s.created_at desc),'[]'::jsonb)
  from public.saved_listings s where s.user_id=auth.uid() and not exists(
    select 1 from public.listings l join public.facilities f on f.id=l.facility_id
    where l.id=s.listing_id and l.status='active' and f.status='approved');
$$;
revoke all on function public.inventory_filter_options(),public.unavailable_saved_listings() from public,anon,authenticated;
grant execute on function public.inventory_filter_options() to anon,authenticated;
grant execute on function public.unavailable_saved_listings() to authenticated;
commit;
