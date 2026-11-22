begin;
-- Keep watchlists caller-owned, with the existing quotas, RLS and email worker.
create function private.watchlist_price_matches(p_criteria jsonb,p_price numeric,p_negotiable boolean) returns boolean
language sql immutable set search_path='' as $$
 select (not p_criteria ? 'min_price' or p_price>=(p_criteria->>'min_price')::numeric)
 and (not p_criteria ? 'max_price' or p_price<=(p_criteria->>'max_price')::numeric)
 and (not p_criteria ? 'negotiable' or p_negotiable);
$$;
revoke all on function private.watchlist_price_matches(jsonb,numeric,boolean) from public,anon,authenticated;
create or replace function private.validate_watchlist() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; v text;
begin
 perform private.require_enabled_account();
 if not exists(select 1 from auth.users where id=new.user_id and email_confirmed_at is not null) then raise exception 'Confirm your account before creating a watchlist.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('watchlists:'||new.user_id::text,0));
 if tg_op='INSERT' and (select count(*) from public.watchlists where user_id=new.user_id)>=20 then raise exception 'Limit of 20 watchlists per account reached.' using errcode='22023'; end if;
 if new.criteria is null or jsonb_typeof(new.criteria)<>'object' then raise exception 'Choose watchlist filters.' using errcode='22023'; end if;
 for k,v in select key,value from jsonb_each_text(new.criteria) loop
  if k not in ('q','catalog_number','manufacturer','procedure_type','product_kind','min_price','max_price','negotiable') or v is null or jsonb_typeof(new.criteria->k)<>'string' or length(btrim(v)) not between 1 and 200 then raise exception 'Invalid watchlist filter.' using errcode='22023'; end if;
 end loop;
 if new.criteria->>'product_kind' is not null and new.criteria->>'product_kind' not in ('capital','disposable') then raise exception 'Invalid product kind.' using errcode='22023'; end if;
 if new.criteria='{}'::jsonb then raise exception 'Choose at least one filter.' using errcode='22023'; end if;
 for k,v in select key,value from jsonb_each_text(new.criteria) where key in ('min_price','max_price') loop
  if v !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then raise exception 'Enter a valid USD price with at most two decimal places.' using errcode='22023'; end if;
  if v::numeric>9999999999.99 then raise exception 'Price is too large.' using errcode='22023'; end if;
 end loop;
 if new.criteria ? 'min_price' and new.criteria ? 'max_price' and (new.criteria->>'min_price')::numeric>(new.criteria->>'max_price')::numeric then raise exception 'Minimum price must not exceed maximum price.' using errcode='22023'; end if;
 if new.criteria ? 'negotiable' and new.criteria->>'negotiable'<>'yes' then raise exception 'Choose negotiable listings only, or omit that filter.' using errcode='22023'; end if;
 return new;
end;$$;
create or replace function private.match_new_inventory() returns trigger language plpgsql security definer set search_path='' as $$
declare w public.watchlists;p public.products;m public.manufacturers;destination text;match_id uuid;
begin
 if new.status<>'active' or new.deleted_at is not null or not public.facility_is_public(new.facility_id) then return new; end if;
 if tg_op='UPDATE' and old.status='active' then return new; end if;
 select * into p from public.products where id=new.product_id;
 select * into m from public.manufacturers where id=p.manufacturer_id;
 for w in select * from public.watchlists where enabled loop
  if not private.watchlist_price_matches(w.criteria,new.price_usd,new.price_negotiable) then continue; end if;
  if w.criteria ? 'manufacturer' and public.normalize_identity(w.criteria->>'manufacturer')<>public.normalize_identity(m.name) then continue; end if;
  if w.criteria ? 'catalog_number' and public.normalize_identity(w.criteria->>'catalog_number')<>p.normalized_catalog_number then continue; end if;
  if w.criteria ? 'procedure_type' and w.criteria->>'procedure_type'<>new.procedure_type then continue; end if;
  if w.criteria ? 'product_kind' and w.criteria->>'product_kind' is distinct from new.inventory_kind then continue; end if;
  if w.criteria ? 'q' and exists(select 1 from regexp_split_to_table(lower(btrim(w.criteria->>'q')),'\s+') token where token<>'' and strpos(lower(p.name||' '||p.catalog_number||' '||m.name||' '||p.description),token)=0) then continue; end if;
  destination:=null;
  -- Read the real verified Auth email, never profile metadata or caller input.
  select email into destination from auth.users where id=w.user_id and email_confirmed_at is not null;
  if destination is null then continue; end if;
  match_id:=null;
  insert into public.watchlist_matches(watchlist_id,listing_id,product_name,catalog_number) values(w.id,new.id,p.name,p.catalog_number)
   on conflict(watchlist_id,listing_id) do nothing returning id into match_id;
  if match_id is not null and w.email_enabled then
   insert into private.email_jobs(kind,user_id,recipient,watchlist_id,listing_id,payload)
    values('watchlist',w.user_id,destination,w.id,new.id,jsonb_build_object('watchlist',w.name,'product',p.name,'catalog',p.catalog_number)) on conflict do nothing;
  end if;
 end loop;
 return new;
end;$$;
-- Recheck current price criteria before dispatch, including during old-worker rollout.
create or replace function public.claim_email_jobs(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.email_jobs;items jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid batch size.' using errcode='22023'; end if;
 for job in select * from private.email_jobs where kind in ('watchlist','referral') and (state='pending' or (state='sending' and claimed_at<clock_timestamp()-interval '10 minutes')) order by created_at for update skip locked limit p_limit loop
  if job.attempts>=5 or job.created_at<clock_timestamp()-interval '23 hours' then update private.email_jobs set state='failed' where id=job.id;continue;end if;
  if not exists(select 1 from auth.users account where account.id=job.user_id and email_confirmed_at is not null and to_jsonb(account)->>'deleted_at' is null and coalesce((to_jsonb(account)->>'banned_until')::timestamptz,'-infinity')<=now() and not exists(select 1 from private.account_controls c where c.user_id=job.user_id and (c.disabled or c.removal_requested_at is not null or c.removed_at is not null)))
  or (job.kind='watchlist' and not exists(select 1 from public.watchlists w join public.listings l on l.id=job.listing_id join auth.users u on u.id=w.user_id
   where w.id=job.watchlist_id and w.enabled and w.email_enabled and private.watchlist_price_matches(w.criteria,l.price_usd,l.price_negotiable) and u.email=job.recipient and l.status='active' and l.deleted_at is null and public.facility_is_public(l.facility_id)))
  or (job.kind='referral' and not exists(select 1 from public.facility_referrals r join public.facilities f on f.id=r.facility_id where r.id=job.referral_id and f.status='approved' and exists(select 1 from public.facility_memberships m where m.facility_id=f.id and m.user_id=job.user_id and m.status='active' and (m.role in ('administrator','inventory_editor') or (m.role='owner' and f.owner_user_id=job.user_id))))) then
   update private.email_jobs set state='cancelled' where id=job.id;continue;
  end if;
  update private.email_jobs set state='sending',claimed_at=clock_timestamp(),claim_token=gen_random_uuid(),attempts=attempts+1 where id=job.id returning * into job;
  items:=items||jsonb_build_array(jsonb_build_object('id',job.id,'kind',job.kind,'recipient',job.recipient,'listing_id',job.listing_id,'payload',job.payload,'claim_token',job.claim_token));
 end loop;
 return items;
end;$$;
create or replace function public.claim_email_jobs_v2(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.email_jobs;items jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid batch size.' using errcode='22023'; end if;
 for job in select * from private.email_jobs where kind in ('watchlist','referral','facility_approved') and (state='pending' or (state='sending' and claimed_at<clock_timestamp()-interval '10 minutes')) order by created_at for update skip locked limit p_limit loop
  if job.attempts>=5 or job.created_at<clock_timestamp()-interval '23 hours' then update private.email_jobs set state='failed' where id=job.id;continue;end if;
  if not exists(select 1 from auth.users account where account.id=job.user_id and email_confirmed_at is not null and to_jsonb(account)->>'deleted_at' is null and coalesce((to_jsonb(account)->>'banned_until')::timestamptz,'-infinity')<=now() and not exists(select 1 from private.account_controls c where c.user_id=job.user_id and (c.disabled or c.removal_requested_at is not null or c.removed_at is not null)))
  or (job.kind='watchlist' and not exists(select 1 from public.watchlists w join public.listings l on l.id=job.listing_id join auth.users u on u.id=w.user_id
   where w.id=job.watchlist_id and w.enabled and w.email_enabled and private.watchlist_price_matches(w.criteria,l.price_usd,l.price_negotiable) and u.email=job.recipient and l.status='active' and l.deleted_at is null and public.facility_is_public(l.facility_id)))
  or (job.kind='facility_approved' and not exists(select 1 from public.facilities f join auth.users u on u.id=f.owner_user_id join private.facility_approval_audit a on a.id=job.approval_audit_id where f.id=job.facility_id and f.status='approved' and f.owner_user_id=job.user_id and u.email=job.recipient and a.facility_id=f.id and a.new_status='approved' and exists(select 1 from public.facility_memberships m where m.facility_id=f.id and m.user_id=job.user_id and m.status='active' and m.role='owner')))
  or (job.kind='referral' and not exists(select 1 from public.facility_referrals r join public.facilities f on f.id=r.facility_id where r.id=job.referral_id and f.status='approved' and exists(select 1 from public.facility_memberships m where m.facility_id=f.id and m.user_id=job.user_id and m.status='active' and (m.role in ('administrator','inventory_editor') or (m.role='owner' and f.owner_user_id=job.user_id))))) then
   update private.email_jobs set state='cancelled' where id=job.id;continue;
  end if;
  update private.email_jobs set state='sending',claimed_at=clock_timestamp(),claim_token=gen_random_uuid(),attempts=attempts+1 where id=job.id returning * into job;
  items:=items||jsonb_build_array(jsonb_build_object('id',job.id,'kind',job.kind,'recipient',job.recipient,'listing_id',job.listing_id,'payload',job.payload,'claim_token',job.claim_token));
 end loop;
 return items;
end;$$;
create or replace function public.claim_email_jobs_v3(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.email_jobs;items jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid batch size.' using errcode='22023'; end if;
 for job in select * from private.email_jobs where state='pending' or (state='sending' and claimed_at<clock_timestamp()-interval '10 minutes') order by created_at for update skip locked limit p_limit loop
  if job.attempts>=5 or job.created_at<clock_timestamp()-interval '23 hours' then update private.email_jobs set state='failed' where id=job.id;continue;end if;
  if not exists(select 1 from auth.users account where account.id=job.user_id and email_confirmed_at is not null and to_jsonb(account)->>'deleted_at' is null and coalesce((to_jsonb(account)->>'banned_until')::timestamptz,'-infinity')<=now() and not exists(select 1 from private.account_controls c where c.user_id=job.user_id and (c.disabled or c.removal_requested_at is not null or c.removed_at is not null)))
  or (job.kind='watchlist' and not exists(select 1 from public.watchlists w join public.listings l on l.id=job.listing_id join auth.users u on u.id=w.user_id
   where w.id=job.watchlist_id and w.enabled and w.email_enabled and private.watchlist_price_matches(w.criteria,l.price_usd,l.price_negotiable) and u.email=job.recipient and l.status='active' and l.deleted_at is null and public.facility_is_public(l.facility_id)))
  or (job.kind='facility_approved' and not exists(select 1 from public.facilities f join auth.users u on u.id=f.owner_user_id join private.facility_approval_audit a on a.id=job.approval_audit_id where f.id=job.facility_id and f.status='approved' and f.owner_user_id=job.user_id and u.email=job.recipient and a.facility_id=f.id and a.new_status='approved' and exists(select 1 from public.facility_memberships m where m.facility_id=f.id and m.user_id=job.user_id and m.status='active' and m.role='owner')))
  or (job.kind='listing_rejected' and not exists(select 1 from public.listings l join public.facility_listing_alerts a on a.listing_id=l.id and a.id=job.listing_moderation_id join auth.users u on u.id=job.user_id join public.facility_memberships m on m.user_id=u.id and m.facility_id=l.facility_id join public.facilities f on f.id=m.facility_id where l.id=job.listing_id and l.facility_id=job.facility_id and l.moderation_rejected and l.deleted_at is null and a.cleared_at is null and u.email=job.recipient and m.status='active' and (m.role='inventory_editor' or (m.role='owner' and f.owner_user_id=u.id))))
  or (job.kind='referral' and not exists(select 1 from public.facility_referrals r join public.facilities f on f.id=r.facility_id where r.id=job.referral_id and f.status='approved' and exists(select 1 from public.facility_memberships m where m.facility_id=f.id and m.user_id=job.user_id and m.status='active' and (m.role in ('administrator','inventory_editor') or (m.role='owner' and f.owner_user_id=job.user_id))))) then
   update private.email_jobs set state='cancelled' where id=job.id;continue;
  end if;
  update private.email_jobs set state='sending',claimed_at=clock_timestamp(),claim_token=gen_random_uuid(),attempts=attempts+1 where id=job.id returning * into job;
  items:=items||jsonb_build_array(jsonb_build_object('id',job.id,'kind',job.kind,'recipient',job.recipient,'listing_id',job.listing_id,'payload',job.payload,'claim_token',job.claim_token));
 end loop;
 return items;
end;$$;
create function public.watchlist_price_filters_available() returns boolean language sql immutable set search_path='' as $$select true;$$;
revoke all on function public.watchlist_price_filters_available() from public,anon;
grant execute on function public.watchlist_price_filters_available() to authenticated;
commit;
