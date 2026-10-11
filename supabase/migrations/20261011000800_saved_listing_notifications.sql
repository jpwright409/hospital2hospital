begin;
create index saved_listings_listing_watchers on public.saved_listings(listing_id,user_id);
create table public.saved_listing_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  listing_id uuid not null,
  listing_revision integer not null,
  product_name text not null,
  catalog_number text not null,
  changes jsonb not null check (jsonb_typeof(changes)='object' and changes<>'{}'::jsonb),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  foreign key(user_id,listing_id) references public.saved_listings(user_id,listing_id) on delete cascade,
  unique(user_id,listing_id,listing_revision)
);
alter table public.saved_listing_updates enable row level security;
create index saved_updates_user_page on public.saved_listing_updates(user_id,created_at desc,id);
create index saved_updates_unread on public.saved_listing_updates(user_id) where read_at is null;
create policy saved_updates_read on public.saved_listing_updates for select to authenticated
  using(user_id=(select auth.uid()));
revoke all on public.saved_listing_updates from public,anon,authenticated;
grant select on public.saved_listing_updates to authenticated;

-- Runs in the inventory mutation transaction, including direct guarded RPC calls.
-- Only formerly/currently public inventory generates notices. Private edits never do.
create function private.notify_saved_listing_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare delta jsonb:='{}'::jsonb; field text; before_values jsonb; after_values jsonb;
begin
  if not public.facility_is_public(new.facility_id) or (old.status<>'active' and new.status<>'active') then return new; end if;
  if old.status is distinct from new.status then delta:=jsonb_build_object('status',new.status); end if;
  if new.status='active' then
    before_values:=to_jsonb(old);after_values:=to_jsonb(new);
    foreach field in array array['quantity','quantity_unit','units_per_package','price_usd','condition','expiration','sterile','single_use','packaging'] loop
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
revoke all on function private.notify_saved_listing_update() from public,anon,authenticated;
create trigger listing_saved_update after update on public.listings
  for each row execute function private.notify_saved_listing_update();

create function public.my_saved_listing_updates(p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Log in to view saved listing updates.' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid notification page.' using errcode='22023'; end if;
  with items as (
    select n.id,n.listing_id,n.product_name,n.catalog_number,n.changes,n.created_at,n.read_at,
      (l.status='active' and public.facility_is_public(l.facility_id)) as public_available
    from public.saved_listing_updates n join public.listings l on l.id=n.listing_id
    where n.user_id=auth.uid() order by n.created_at desc,n.id desc
    limit 20 offset ((p_page::bigint-1)*20)
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(items) order by created_at desc,id desc) from items),'[]'::jsonb),
    'total',(select count(*) from public.saved_listing_updates where user_id=auth.uid()),
    'unread',(select count(*) from public.saved_listing_updates where user_id=auth.uid() and read_at is null)) into result;
  return result;
end;
$$;
create function public.mark_saved_listing_updates_read(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Log in to update notifications.' using errcode='42501'; end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 100 then raise exception 'Select 1-100 notifications.' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_ids) item where not exists(
    select 1 from public.saved_listing_updates n where n.id=item and n.user_id=auth.uid())) then
    raise exception 'Notification unavailable to your account. Refresh and retry.' using errcode='42501';
  end if;
  update public.saved_listing_updates set read_at=coalesce(read_at,clock_timestamp()) where user_id=auth.uid() and id=any(p_ids);
end;
$$;
create function public.my_saved_listing_update_count() returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.saved_listing_updates where user_id=auth.uid() and read_at is null;
$$;
revoke all on function public.my_saved_listing_updates(integer),public.mark_saved_listing_updates_read(uuid[]),public.my_saved_listing_update_count() from public,anon;
grant execute on function public.my_saved_listing_updates(integer),public.mark_saved_listing_updates_read(uuid[]),public.my_saved_listing_update_count() to authenticated;
commit;
