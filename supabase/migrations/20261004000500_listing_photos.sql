begin;
-- Metadata is a reservation journal as well as a gallery. Never publish raw uploads.
create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings,
  object_path text not null unique,
  created_by uuid not null references auth.users,
  state text not null default 'pending' check(state in ('pending','ready','deleting')),
  position integer not null default 0 check(position >= 0),
  is_cover boolean not null default false,
  width integer, height integer, size_bytes integer,
  created_at timestamptz not null default now(),
  check (state <> 'ready' or (width is not null and height is not null and size_bytes is not null
    and width between 1 and 10000 and height between 1 and 10000 and size_bytes between 1 and 5242880)),
  check(not is_cover or state='ready')
);
alter table public.listing_photos enable row level security;
create index listing_photos_listing on public.listing_photos(listing_id,state,position);
create unique index listing_photo_cover on public.listing_photos(listing_id) where is_cover and state='ready';
create function public.photo_can_manage(p_listing_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.listings l where l.id=p_listing_id and public.facility_can_publish(l.facility_id))
    and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null);
$$;
create function public.photo_can_read(p_listing_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.listings where id=p_listing_id and status='active' and public.facility_is_public(facility_id))
    or public.photo_can_manage(p_listing_id);
$$;
revoke all on function public.photo_can_manage(uuid),public.photo_can_read(uuid) from public;
grant execute on function public.photo_can_manage(uuid),public.photo_can_read(uuid) to anon,authenticated;
create policy photos_read on public.listing_photos for select to anon,authenticated
  using((state='ready' and public.photo_can_read(listing_id)) or public.photo_can_manage(listing_id));
revoke all on public.listing_photos from public,anon,authenticated;
-- Uploader identity is never exposed with public gallery metadata.
grant select(id,listing_id,object_path,state,position,is_cover,width,height,size_bytes,created_at) on public.listing_photos to anon,authenticated;
grant select on public.listing_photos to service_role;
create function public.reserve_listing_photo(p_listing_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.listings; photo public.listing_photos; fid uuid; pid uuid := gen_random_uuid();
begin
  select facility_id into fid from public.listings where id=p_listing_id;
  perform private.require_inventory_manager(fid);
  select * into l from public.listings where id=p_listing_id for update;
  if (select count(*) from public.listing_photos where listing_id=p_listing_id and state in ('pending','ready')) >= 6 then
    raise exception 'Six photos are allowed. Remove a photo or clean up an unfinished upload first.' using errcode='22023';
  end if;
  insert into public.listing_photos(id,listing_id,created_by,object_path,position)
    values(pid,p_listing_id,auth.uid(),fid::text||'/'||p_listing_id::text||'/'||pid::text||'.webp',
      coalesce((select max(position)+1 from public.listing_photos where listing_id=p_listing_id),0)) returning * into photo;
  return jsonb_build_object('id',photo.id,'object_path',photo.object_path);
end;
$$;
-- Only trusted server code may finalize, after full decoding and re-encoding.
create function public.finalize_listing_photo(p_photo_id uuid,p_width integer,p_height integer,p_size integer) returns void
language plpgsql security definer set search_path = '' as $$
declare photo public.listing_photos; l public.listings; m public.facility_memberships; f public.facilities;
begin
  select * into photo from public.listing_photos where id=p_photo_id;
  select * into f from public.facilities where id=(select facility_id from public.listings where id=photo.listing_id) for share;
  select * into m from public.facility_memberships where facility_id=f.id and user_id=photo.created_by for share;
  if f.status is distinct from 'approved' or m.status is distinct from 'active'
    or not (m.role='inventory_editor' or (m.role='owner' and f.owner_user_id=photo.created_by))
    or not exists(select 1 from auth.users where id=photo.created_by and email_confirmed_at is not null) then
    raise exception 'Photo uploader is no longer authorized.' using errcode='42501';
  end if;
  select * into l from public.listings where id=photo.listing_id for update;
  select * into photo from public.listing_photos where id=p_photo_id for update;
  if photo.state is distinct from 'pending' then raise exception 'Upload reservation is no longer pending.' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects where bucket_id='listing-photos' and name=photo.object_path
    and metadata->>'mimetype'='image/webp' and (metadata->>'size')::bigint=p_size) then
    raise exception 'Validated upload was not found in Storage.' using errcode='22023';
  end if;
  update public.listing_photos set state='ready',width=p_width,height=p_height,size_bytes=p_size,
    is_cover=not exists(select 1 from public.listing_photos where listing_id=l.id and state='ready') where id=p_photo_id;
end;
$$;
create function public.remove_listing_photo(p_photo_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare photo public.listing_photos; fid uuid;
begin
  select * into photo from public.listing_photos where id=p_photo_id;
  select facility_id into fid from public.listings where id=photo.listing_id;
  perform private.require_inventory_manager(fid);
  perform 1 from public.listings where id=photo.listing_id for update;
  -- A concurrent reorder/cover change may have committed while we waited.
  select * into photo from public.listing_photos where id=p_photo_id for update;
  if photo.id is null then raise exception 'Photo changed. Reload before removing it.' using errcode='22023'; end if;
  update public.listing_photos set state='deleting',is_cover=false where id=p_photo_id;
  if photo.is_cover then update public.listing_photos set is_cover=true where id=(
    select id from public.listing_photos where listing_id=photo.listing_id and state='ready' order by position,id limit 1); end if;
  return photo.object_path;
end;
$$;
create function public.arrange_listing_photos(p_listing_id uuid,p_ids uuid[],p_cover uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare fid uuid; expected integer;
begin
  select facility_id into fid from public.listings where id=p_listing_id;
  perform private.require_inventory_manager(fid);
  perform 1 from public.listings where id=p_listing_id for update;
  select count(*) into expected from public.listing_photos where listing_id=p_listing_id and state='ready';
  if p_ids is null or cardinality(p_ids) <> expected or expected=0 or p_cover is null or not(p_cover=any(p_ids))
    or (select count(distinct id) from unnest(p_ids) id) <> expected
    or exists(select 1 from unnest(p_ids) id where not exists(select 1 from public.listing_photos p where p.id=id and p.listing_id=p_listing_id and p.state='ready')) then
    raise exception 'Photos changed. Reload and select only this listing’s complete gallery.' using errcode='22023';
  end if;
  update public.listing_photos set is_cover=false where listing_id=p_listing_id;
  update public.listing_photos p set position=o.ordinality-1,is_cover=(p.id=p_cover)
    from unnest(p_ids) with ordinality o(id,ordinality) where p.id=o.id and p.listing_id=p_listing_id;
end;
$$;
-- Compensation/cleanup only claims pending/deleting rows, never published assets.
create function public.claim_photo_cleanup(p_photo_id uuid,p_stale_only boolean default true) returns text
language plpgsql security definer set search_path = '' as $$
declare photo public.listing_photos;
begin
  select * into photo from public.listing_photos where id=p_photo_id;
  perform 1 from public.listings where id=photo.listing_id for update;
  select * into photo from public.listing_photos where id=p_photo_id for update;
  if photo.state='ready' or photo.id is null or (p_stale_only and photo.state='pending' and photo.created_at>now()-interval '1 hour') then return null; end if;
  update public.listing_photos set state='deleting',is_cover=false where id=p_photo_id;
  return photo.object_path;
end;
$$;
create function public.finish_photo_cleanup(p_photo_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare photo public.listing_photos;
begin
  select * into photo from public.listing_photos where id=p_photo_id for update;
  if photo.state is distinct from 'deleting' then raise exception 'Cleanup was not claimed.' using errcode='22023'; end if;
  if exists(select 1 from storage.objects where bucket_id='listing-photos' and name=photo.object_path) then
    raise exception 'Remove the exact object through the Storage API before finishing cleanup.' using errcode='22023'; end if;
  delete from public.listing_photos where id=p_photo_id;
end;
$$;
revoke all on function public.reserve_listing_photo(uuid),public.remove_listing_photo(uuid),public.arrange_listing_photos(uuid,uuid[],uuid) from public,anon;
grant execute on function public.reserve_listing_photo(uuid),public.remove_listing_photo(uuid),public.arrange_listing_photos(uuid,uuid[],uuid) to authenticated;
revoke all on function public.finalize_listing_photo(uuid,integer,integer,integer),public.claim_photo_cleanup(uuid,boolean),public.finish_photo_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.finalize_listing_photo(uuid,integer,integer,integer),public.claim_photo_cleanup(uuid,boolean),public.finish_photo_cleanup(uuid) to service_role;
-- Never authorize solely from a path prefix: resolve an exact reserved metadata row.
create function public.photo_object_allowed(p_name text,p_operation text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.listing_photos p where p.object_path=p_name and
    case p_operation
      when 'insert' then p.state='pending' and public.photo_can_manage(p.listing_id)
      when 'delete' then p.state='deleting' and public.photo_can_manage(p.listing_id)
      when 'select' then (p.state='ready' and public.photo_can_read(p.listing_id)) or public.photo_can_manage(p.listing_id)
      else false end);
$$;
revoke all on function public.photo_object_allowed(text,text) from public;
grant execute on function public.photo_object_allowed(text,text) to anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('listing-photos','listing-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
-- Storage already enables RLS. Do not alter ownership or delete its metadata directly.
create policy h2h_photo_select on storage.objects for select to anon,authenticated using(bucket_id='listing-photos' and public.photo_object_allowed(name,'select'));
create policy h2h_photo_insert on storage.objects for insert to authenticated with check(bucket_id='listing-photos' and public.photo_object_allowed(name,'insert'));
create policy h2h_photo_delete on storage.objects for delete to authenticated using(bucket_id='listing-photos' and public.photo_object_allowed(name,'delete'));
-- Restrictive fences prevent an existing broad Storage policy bypassing this bucket.
create policy h2h_photo_select_fence on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'listing-photos' or public.photo_object_allowed(name,'select'));
create policy h2h_photo_insert_fence on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'listing-photos' or public.photo_object_allowed(name,'insert'));
create policy h2h_photo_delete_fence on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'listing-photos' or public.photo_object_allowed(name,'delete'));
create policy h2h_photo_update_fence on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'listing-photos') with check(bucket_id<>'listing-photos');
commit;
