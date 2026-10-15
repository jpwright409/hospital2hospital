begin;
alter table public.listings drop constraint listings_status_check;
alter table public.listings add constraint listings_status_check check(status in ('draft','active','inactive','sold'));
-- Idempotent draft creation: no ordinary access to request identity/payload.
create table private.listing_draft_requests (
 request_id uuid primary key,user_id uuid not null references auth.users,facility_id uuid not null references public.facilities,
 listing_id uuid not null references public.listings,payload jsonb not null,created_at timestamptz not null default now()
);
alter table private.listing_draft_requests enable row level security;
revoke all on private.listing_draft_requests from public,anon,authenticated;
create function public.create_inventory_draft(p_request_id uuid,p_facility_id uuid,p_product jsonb,p_inventory jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare request private.listing_draft_requests;lid uuid;body jsonb;
begin
 perform private.require_inventory_manager(p_facility_id);
 if p_request_id is null or p_product is null or p_inventory is null or jsonb_typeof(p_product)<>'object' or jsonb_typeof(p_inventory)<>'object' then raise exception 'Invalid draft submission.' using errcode='22023'; end if;
 body:=jsonb_build_object('product',p_product,'inventory',p_inventory||jsonb_build_object('status','draft'));
 perform pg_advisory_xact_lock(hashtextextended('listing-draft:'||p_request_id::text,0));
 select * into request from private.listing_draft_requests where request_id=p_request_id;
 if found then
  if request.user_id<>auth.uid() or request.facility_id<>p_facility_id or request.payload<>body then raise exception 'Draft submission changed. Reload before retrying.' using errcode='42501'; end if;
  if exists(select 1 from public.listings where id=request.listing_id and deleted_at is null) then return request.listing_id; end if;
  raise exception 'This draft was deleted. Start a new listing.' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('facility-drafts:'||p_facility_id::text,0));
 if (select count(*) from public.listings where facility_id=p_facility_id and status='draft' and deleted_at is null)>=100 then raise exception 'Remove or publish existing drafts before creating more (100 per facility).' using errcode='22023'; end if;
 lid:=public.create_inventory_listing(p_facility_id,p_product,p_inventory||jsonb_build_object('status','draft'));
 insert into private.listing_draft_requests(request_id,user_id,facility_id,listing_id,payload) values(p_request_id,auth.uid(),p_facility_id,lid,body);
 return lid;
end;$$;
revoke all on function public.create_inventory_draft(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_inventory_draft(uuid,uuid,jsonb,jsonb) to authenticated;
-- An upload submission can never create two photos after a lost response.
alter table public.listing_photos add column upload_request_id uuid unique;
create function public.reserve_listing_photo_once(p_listing_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare fid uuid;photo public.listing_photos;result jsonb;
begin
 if p_request_id is null then raise exception 'Missing upload submission ID.' using errcode='22023'; end if;
 select facility_id into fid from public.listings where id=p_listing_id;
 perform private.require_inventory_manager(fid);
 if not public.photo_can_manage(p_listing_id) then raise exception 'Listing unavailable.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('photo-submission:'||p_request_id::text,0));
 select * into photo from public.listing_photos where upload_request_id=p_request_id;
 if found then
  if photo.created_by<>auth.uid() or photo.listing_id<>p_listing_id then raise exception 'Upload submission unavailable.' using errcode='42501'; end if;
  if photo.state='ready' then return jsonb_build_object('id',photo.id,'object_path',photo.object_path,'state','ready'); end if;
  raise exception 'This upload is unfinished. Refresh photos, then remove its pending reservation before retrying.' using errcode='22023';
 end if;
 result:=public.reserve_listing_photo(p_listing_id);
 update public.listing_photos set upload_request_id=p_request_id where id=(result->>'id')::uuid;
 return result||jsonb_build_object('state','pending');
end;$$;
revoke all on function public.reserve_listing_photo_once(uuid,uuid) from public,anon;
grant execute on function public.reserve_listing_photo_once(uuid,uuid) to authenticated;
commit;
