begin;
create table public.watchlists (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,
 name text not null check(length(btrim(name)) between 2 and 120),
 criteria jsonb not null check(jsonb_typeof(criteria)='object' and criteria<>'{}'::jsonb),
 enabled boolean not null default true,email_enabled boolean not null default false,created_at timestamptz not null default now()
);
alter table public.watchlists enable row level security;
create policy watchlists_own on public.watchlists for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.watchlists from public,anon,authenticated;
grant select,insert,delete on public.watchlists to authenticated;
grant update(name,criteria,enabled,email_enabled) on public.watchlists to authenticated;
create function private.validate_watchlist() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; v text;
begin
 if not exists(select 1 from auth.users where id=new.user_id and email_confirmed_at is not null) then raise exception 'Confirm your account before creating a watchlist.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('watchlists:'||new.user_id::text,0));
 if tg_op='INSERT' and (select count(*) from public.watchlists where user_id=new.user_id)>=20 then raise exception 'Limit of 20 watchlists per account reached.' using errcode='22023'; end if;
 if new.criteria is null or jsonb_typeof(new.criteria)<>'object' then raise exception 'Choose watchlist filters.' using errcode='22023'; end if;
 for k,v in select key,value from jsonb_each_text(new.criteria) loop
  if k not in ('q','catalog_number','manufacturer','procedure_type','product_kind') or v is null or jsonb_typeof(new.criteria->k)<>'string' or length(btrim(v)) not between 1 and 200 then raise exception 'Invalid watchlist filter.' using errcode='22023'; end if;
 end loop;
 if new.criteria->>'product_kind' is not null and new.criteria->>'product_kind' not in ('capital','disposable') then raise exception 'Invalid product kind.' using errcode='22023'; end if;
 return new;
end;$$;
revoke all on function private.validate_watchlist() from public,anon,authenticated;
create trigger validate_watchlist before insert or update on public.watchlists for each row execute function private.validate_watchlist();
create table public.watchlist_matches (
 id uuid primary key default gen_random_uuid(),watchlist_id uuid not null references public.watchlists on delete cascade,
 listing_id uuid not null references public.listings,product_name text not null,catalog_number text not null,
 created_at timestamptz not null default clock_timestamp(),unique(watchlist_id,listing_id)
);
alter table public.watchlist_matches enable row level security;
create policy matches_own on public.watchlist_matches for select to authenticated using(exists(select 1 from public.watchlists w where w.id=watchlist_id and w.user_id=auth.uid()));
revoke all on public.watchlist_matches from public,anon,authenticated;
grant select on public.watchlist_matches to authenticated;
create table public.facility_referrals (
 id uuid primary key,user_id uuid not null references auth.users,facility_id uuid not null references public.facilities,
 recipient_email text not null check(length(recipient_email)<=254),created_at timestamptz not null default clock_timestamp()
);
alter table public.facility_referrals enable row level security;
create policy referrals_own on public.facility_referrals for select to authenticated using(user_id=auth.uid());
revoke all on public.facility_referrals from public,anon,authenticated;
grant select on public.facility_referrals to authenticated;
create table private.email_jobs (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('watchlist','referral')),
 user_id uuid not null references auth.users,recipient text not null,
 watchlist_id uuid references public.watchlists on delete cascade,listing_id uuid references public.listings,
 referral_id uuid references public.facility_referrals, payload jsonb not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','cancelled','failed')),
 created_at timestamptz not null default clock_timestamp(),attempts integer not null default 0,
 claim_token uuid,claimed_at timestamptz,provider_id text,
 unique(watchlist_id,listing_id),unique(referral_id)
);
alter table private.email_jobs enable row level security;
create index email_jobs_dispatch on private.email_jobs(state,created_at);
revoke all on private.email_jobs from public,anon,authenticated;

create function private.match_new_inventory() returns trigger language plpgsql security definer set search_path='' as $$
declare w public.watchlists;p public.products;m public.manufacturers;destination text;match_id uuid;
begin
 if new.status<>'active' or new.deleted_at is not null or not public.facility_is_public(new.facility_id) then return new; end if;
 if tg_op='UPDATE' and old.status='active' then return new; end if;
 select * into p from public.products where id=new.product_id;
 select * into m from public.manufacturers where id=p.manufacturer_id;
 for w in select * from public.watchlists where enabled loop
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
revoke all on function private.match_new_inventory() from public,anon,authenticated;
create trigger watch_new_inventory after insert or update on public.listings for each row execute function private.match_new_inventory();

create function public.refer_facility(p_id uuid,p_facility_id uuid,p_email text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result public.facility_referrals;referrer text;facility text;
begin
 perform private.require_conversation_member(p_facility_id);
 p_email:=lower(btrim(p_email));
 if p_id is null or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid recipient email.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('referrals:'||auth.uid()::text,0));
 perform pg_advisory_xact_lock(hashtextextended('referral-address:'||p_email,0));
 select * into result from public.facility_referrals where id=p_id;
 if result.id is not null then
  if result.user_id<>auth.uid() or result.facility_id<>p_facility_id or result.recipient_email<>p_email then raise exception 'This submission is unavailable or changed.' using errcode='42501'; end if;
  return result.id;
 end if;
 if (select count(*) from public.facility_referrals where user_id=auth.uid() and created_at>clock_timestamp()-interval '1 day')>=10
 or exists(select 1 from public.facility_referrals where recipient_email=p_email and created_at>clock_timestamp()-interval '7 days') then raise exception 'Referral limit reached, or this address was invited recently. Try later.' using errcode='22023'; end if;
 select display_name into referrer from public.profiles where id=auth.uid();select name into facility from public.facilities where id=p_facility_id;
 insert into public.facility_referrals(id,user_id,facility_id,recipient_email) values(p_id,auth.uid(),p_facility_id,p_email);
 insert into private.email_jobs(kind,user_id,recipient,referral_id,payload) values('referral',auth.uid(),p_email,p_id,jsonb_build_object('referrer',referrer,'facility',facility));
 return p_id;
end;$$;
revoke all on function public.refer_facility(uuid,uuid,text) from public,anon;
grant execute on function public.refer_facility(uuid,uuid,text) to authenticated;

-- Service-only worker RPCs. Ordinary account operations never need this credential.
create function public.claim_email_jobs(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.email_jobs;items jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid batch size.' using errcode='22023'; end if;
 for job in select * from private.email_jobs where state='pending' or (state='sending' and claimed_at<clock_timestamp()-interval '10 minutes') order by created_at for update skip locked limit p_limit loop
  if job.attempts>=5 or job.created_at<clock_timestamp()-interval '23 hours' then update private.email_jobs set state='failed' where id=job.id;continue;end if;
  if not exists(select 1 from auth.users where id=job.user_id and email_confirmed_at is not null)
  or (job.kind='watchlist' and not exists(select 1 from public.watchlists w join public.listings l on l.id=job.listing_id join auth.users u on u.id=w.user_id
   where w.id=job.watchlist_id and w.enabled and w.email_enabled and u.email=job.recipient and l.status='active' and l.deleted_at is null and public.facility_is_public(l.facility_id)))
  or (job.kind='referral' and not exists(select 1 from public.facility_referrals r join public.facilities f on f.id=r.facility_id where r.id=job.referral_id and f.status='approved' and exists(select 1 from public.facility_memberships m where m.facility_id=f.id and m.user_id=job.user_id and m.status='active' and (m.role in ('administrator','inventory_editor') or (m.role='owner' and f.owner_user_id=job.user_id))))) then
   update private.email_jobs set state='cancelled' where id=job.id;continue;
  end if;
  update private.email_jobs set state='sending',claimed_at=clock_timestamp(),claim_token=gen_random_uuid(),attempts=attempts+1 where id=job.id returning * into job;
  items:=items||jsonb_build_array(jsonb_build_object('id',job.id,'kind',job.kind,'recipient',job.recipient,'listing_id',job.listing_id,'payload',job.payload,'claim_token',job.claim_token));
 end loop;
 return items;
end;$$;
create function public.finish_email_job(p_id uuid,p_token uuid,p_provider_id text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.email_jobs set state=case when p_provider_id is null then 'pending' else 'sent' end,provider_id=p_provider_id
 where id=p_id and claim_token=p_token and state='sending';
 if not found then raise exception 'Email claim expired or unavailable.' using errcode='42501'; end if;
end;$$;
revoke all on function public.claim_email_jobs(integer),public.finish_email_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_email_jobs(integer),public.finish_email_job(uuid,uuid,text) to service_role;
commit;
