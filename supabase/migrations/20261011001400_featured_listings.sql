begin;
create table public.listing_boost_requests (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null unique references public.listings,
 facility_id uuid not null references public.facilities,
 requested_by uuid not null references auth.users,
 status text not null default 'pending' check(status in ('pending','approved','rejected','ended')),
 revision integer not null default 1,
 reviewed_by uuid references auth.users,review_note text not null default '' check(length(review_note)<=1000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
alter table public.listing_boost_requests enable row level security;
create policy boost_requests_read on public.listing_boost_requests for select to authenticated
 using(public.facility_can_publish(facility_id) or public.is_platform_administrator());
revoke all on public.listing_boost_requests from public,anon,authenticated;
grant select on public.listing_boost_requests to authenticated;
create table public.featured_listing_slots (
 slot integer primary key check(slot in (1,2)),
 request_id uuid not null unique references public.listing_boost_requests,
 listing_id uuid not null unique references public.listings
);
alter table public.featured_listing_slots enable row level security;
create policy feature_slots_admin_read on public.featured_listing_slots for select to authenticated using(public.is_platform_administrator());
revoke all on public.featured_listing_slots from public,anon,authenticated;
grant select on public.featured_listing_slots to authenticated;
-- Immutable request identity and slot writes are guarded RPCs only.
create function public.request_listing_boost(p_listing_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.listings;r public.listing_boost_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('featured-listings',0));
 select * into l from public.listings where id=p_listing_id for share;
 if l.id is null then raise exception 'Listing unavailable.' using errcode='42501'; end if;
 perform private.require_inventory_manager(l.facility_id);
 if l.status<>'active' or l.deleted_at is not null then raise exception 'Choose a currently active listing.' using errcode='22023'; end if;
 select * into r from public.listing_boost_requests where listing_id=l.id for update;
 if r.id is not null then
  if r.status in ('pending','approved') then return r.id; end if;
  update public.listing_boost_requests set status='pending',requested_by=auth.uid(),reviewed_by=null,review_note='',
   revision=revision+1,updated_at=clock_timestamp() where id=r.id;
  return r.id;
 end if;
 insert into public.listing_boost_requests(listing_id,facility_id,requested_by) values(l.id,l.facility_id,auth.uid()) returning id into r.id;
 return r.id;
end;$$;
create function public.review_listing_boost(p_id uuid,p_revision integer,p_decision text,p_slot integer default null,p_note text default '') returns void
language plpgsql security definer set search_path='' as $$
declare r public.listing_boost_requests;l public.listings;previous uuid;
begin
 if auth.uid() is null or not public.is_platform_administrator() or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
  raise exception 'Platform administrator permission is required.' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('approved','rejected','ended') or length(coalesce(p_note,''))>1000
  or (p_decision='approved' and (p_slot is null or p_slot not in (1,2))) then raise exception 'Choose a decision and featured slot.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('featured-listings',0));
 select * into r from public.listing_boost_requests where id=p_id for update;
 if r.id is null or p_revision is distinct from r.revision then raise exception 'This request changed. Refresh before reviewing.' using errcode='22023'; end if;
 select * into l from public.listings where id=r.listing_id for share;
 if p_decision='approved' and (l.status<>'active' or l.deleted_at is not null or not public.facility_is_public(l.facility_id)) then
  raise exception 'Only active listings from approved facilities can be featured.' using errcode='22023'; end if;
 if p_decision='approved' then
  select request_id into previous from public.featured_listing_slots where slot=p_slot;
  if previous is not null and previous<>r.id then
   update public.listing_boost_requests set status='ended',revision=revision+1,reviewed_by=auth.uid(),review_note='Replaced in featured slot.',updated_at=clock_timestamp() where id=previous;
  end if;
  delete from public.featured_listing_slots where slot=p_slot or request_id=r.id;
  insert into public.featured_listing_slots(slot,request_id,listing_id) values(p_slot,r.id,r.listing_id);
 else delete from public.featured_listing_slots where request_id=r.id;
 end if;
 update public.listing_boost_requests set status=p_decision,revision=revision+1,reviewed_by=auth.uid(),review_note=coalesce(p_note,''),updated_at=clock_timestamp() where id=r.id;
end;$$;
create function public.public_featured_listing_ids() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(l.id order by s.slot),'[]'::jsonb)
 from public.featured_listing_slots s join public.listing_boost_requests r on r.id=s.request_id
 join public.listings l on l.id=s.listing_id
 where r.status='approved' and r.listing_id=l.id and r.facility_id=l.facility_id
 and l.status='active' and l.deleted_at is null and public.facility_is_public(l.facility_id);
$$;
create function public.my_boost_options() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'listings',
  (select coalesce(jsonb_agg(to_jsonb(items) order by items.name,items.id),'[]'::jsonb) from
   (select l.id,p.name,p.catalog_number from public.listings l join public.products p on p.id=l.product_id
    where l.facility_id=f.id and l.status='active' and l.deleted_at is null order by p.name,l.id limit 500) items)
 ) order by f.name,f.id),'[]'::jsonb)
 from public.facilities f where public.facility_can_publish(f.id);
$$;
revoke all on function public.request_listing_boost(uuid),public.review_listing_boost(uuid,integer,text,integer,text),public.my_boost_options() from public,anon;
grant execute on function public.request_listing_boost(uuid),public.review_listing_boost(uuid,integer,text,integer,text),public.my_boost_options() to authenticated;
revoke all on function public.public_featured_listing_ids() from public;
grant execute on function public.public_featured_listing_ids() to anon,authenticated;
-- Return the safe public inventory projection in the same database snapshot as
-- visibility checks, including when the caller could otherwise read private stock.
create function public.public_featured_inventory() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(v) order by s.slot),'[]'::jsonb)
 from public.featured_listing_slots s join public.listing_boost_requests r on r.id=s.request_id
 join public.marketplace_inventory v on v.id=s.listing_id
 where r.status='approved' and r.listing_id=v.id and r.facility_id=v.facility_id
 and v.status='active' and v.deleted_at is null and public.facility_is_public(v.facility_id);
$$;
revoke all on function public.public_featured_inventory() from public;
grant execute on function public.public_featured_inventory() to anon,authenticated;
create function public.boost_review_queue(p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_platform_administrator() or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
  raise exception 'Platform administrator permission is required.' using errcode='42501'; end if;
 if p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid page.' using errcode='22023'; end if;
 return jsonb_build_object('total',(select count(*) from public.listing_boost_requests),'items',
  (select coalesce(jsonb_agg(to_jsonb(items) order by items.updated_at desc,items.id),'[]'::jsonb) from
   (select r.id,r.listing_id,r.status,r.revision,r.review_note,r.updated_at,p.name,p.catalog_number,f.name as facility_name,
    f.status as facility_status,case when l.deleted_at is not null then 'deleted' else l.status end as listing_status,
    (select slot from public.featured_listing_slots where request_id=r.id) as slot
    from public.listing_boost_requests r join public.listings l on l.id=r.listing_id
    join public.products p on p.id=l.product_id join public.facilities f on f.id=l.facility_id
    order by r.updated_at desc,r.id limit 20 offset (p_page-1)*20) items));
end;$$;
revoke all on function public.boost_review_queue(integer) from public,anon;
grant execute on function public.boost_review_queue(integer) to authenticated;
commit;
