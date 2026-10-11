begin;
create table public.support_tickets (
 id uuid primary key,user_id uuid not null references auth.users,
 account_email text not null,contact_email text not null check(length(contact_email)<=254),
 contact_name text not null check(length(btrim(contact_name)) between 2 and 120),
 contact_phone text not null default '' check(length(contact_phone)<=40),
 facility_name text not null default '' check(length(facility_name)<=160),
 issue text not null check(length(btrim(issue)) between 10 and 5000),
 status text not null default 'open' check(status in ('open','in_progress','closed')),
 screenshot_path text unique,screenshot_state text not null default 'none' check(screenshot_state in ('none','pending','ready')),
 screenshot_width integer,screenshot_height integer,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((screenshot_state='none' and screenshot_path is null) or (screenshot_state in ('pending','ready') and screenshot_path is not null)),
 check(screenshot_state<>'ready' or (screenshot_width is not null and screenshot_height is not null and screenshot_width between 1 and 2400 and screenshot_height between 1 and 2400))
);
alter table public.support_tickets enable row level security;
create index support_tickets_user_created on public.support_tickets(user_id,created_at desc);
create index support_tickets_status_created on public.support_tickets(status,created_at desc);
create policy support_read on public.support_tickets for select to authenticated using(user_id=auth.uid() or public.is_platform_administrator());
revoke all on public.support_tickets from public,anon,authenticated;
grant select on public.support_tickets to authenticated;
create function public.submit_support_ticket(p_id uuid,p_contact jsonb,p_issue text,p_screenshot boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.support_tickets;email text;k text;
begin
 select u.email into email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if auth.uid() is null or email is null then raise exception 'Sign in with a confirmed account to submit a support ticket.' using errcode='42501';end if;
 if p_id is null or p_screenshot is null or p_issue is null or length(btrim(p_issue)) not between 10 and 5000 or p_contact is null or jsonb_typeof(p_contact)<>'object' then raise exception 'Enter contact information and an issue of 10-5000 characters.' using errcode='22023';end if;
 for k in select jsonb_object_keys(p_contact) loop
  if k not in ('name','email','phone','facility') or jsonb_typeof(p_contact->k)<>'string' then raise exception 'Invalid contact field.' using errcode='22023';end if;
 end loop;
 if p_contact->>'name' is null or length(btrim(p_contact->>'name')) not between 2 and 120
 or p_contact->>'email' is null or length(p_contact->>'email')>254 or p_contact->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or length(coalesce(p_contact->>'phone',''))>40 or length(coalesce(p_contact->>'facility',''))>160 then raise exception 'Enter a name, valid contact email, and bounded phone/facility fields.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('support:'||auth.uid()::text,0));
 select * into t from public.support_tickets where id=p_id;
 if t.id is not null then
  if t.user_id<>auth.uid() or t.contact_name<>btrim(p_contact->>'name') or t.contact_email<>btrim(p_contact->>'email') or t.contact_phone<>coalesce(p_contact->>'phone','') or t.facility_name<>coalesce(p_contact->>'facility','') or t.issue<>btrim(p_issue) or (t.screenshot_path is not null)<>p_screenshot then
   raise exception 'This ticket submission is unavailable or changed. Start a new form.' using errcode='42501';end if;
  return jsonb_build_object('id',t.id,'screenshot_path',t.screenshot_path,'screenshot_state',t.screenshot_state);
 end if;
 if (select count(*) from public.support_tickets where user_id=auth.uid() and created_at>clock_timestamp()-interval '1 day')>=5 then raise exception 'Support ticket limit reached (5/day). Review your existing tickets or try later.' using errcode='22023';end if;
 insert into public.support_tickets(id,user_id,account_email,contact_name,contact_email,contact_phone,facility_name,issue,screenshot_path,screenshot_state)
 values(p_id,auth.uid(),email,btrim(p_contact->>'name'),btrim(p_contact->>'email'),coalesce(p_contact->>'phone',''),coalesce(p_contact->>'facility',''),btrim(p_issue),
 case when p_screenshot then p_id::text||'/'||gen_random_uuid()::text||'.webp' else null end,case when p_screenshot then 'pending' else 'none' end) returning * into t;
 return jsonb_build_object('id',t.id,'screenshot_path',t.screenshot_path,'screenshot_state',t.screenshot_state);
end;$$;
create function public.set_support_ticket_status(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_administrator() then raise exception 'Platform support administrator required.' using errcode='42501';end if;
 if p_status is null or p_status not in ('open','in_progress','closed') then raise exception 'Choose a valid support status.' using errcode='22023';end if;
 update public.support_tickets set status=p_status,updated_at=clock_timestamp() where id=p_id;
 if not found then raise exception 'Ticket unavailable.' using errcode='22023';end if;
end;$$;
revoke all on function public.submit_support_ticket(uuid,jsonb,text,boolean),public.set_support_ticket_status(uuid,text) from public,anon;
grant execute on function public.submit_support_ticket(uuid,jsonb,text,boolean),public.set_support_ticket_status(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('support-screenshots','support-screenshots',false,5242880,array['image/webp'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function public.support_screenshot_allowed(p_path text,p_operation text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.support_tickets t join auth.users u on u.id=auth.uid()
 where t.screenshot_path=p_path and u.email_confirmed_at is not null and (
  (p_operation='read' and ((t.screenshot_state='ready' and (t.user_id=auth.uid() or public.is_platform_administrator())) or (t.screenshot_state='pending' and t.user_id=auth.uid())))
  or (p_operation in ('upload','cleanup') and t.screenshot_state='pending' and t.user_id=auth.uid() and t.created_at>clock_timestamp()-interval '1 day')
  or (p_operation='cleanup' and t.screenshot_state='pending' and public.is_platform_administrator())));
$$;
revoke all on function public.support_screenshot_allowed(text,text) from public,anon;
grant execute on function public.support_screenshot_allowed(text,text) to anon,authenticated;
create policy support_screenshot_insert on storage.objects for insert to authenticated with check(bucket_id='support-screenshots' and public.support_screenshot_allowed(name,'upload'));
create policy support_screenshot_read on storage.objects for select to authenticated using(bucket_id='support-screenshots' and public.support_screenshot_allowed(name,'read'));
create policy support_screenshot_cleanup on storage.objects for delete to authenticated using(bucket_id='support-screenshots' and public.support_screenshot_allowed(name,'cleanup'));
-- Restrictive fences prevent preexisting broad policies bypassing this bucket.
create policy support_screenshot_insert_fence on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'support-screenshots' or public.support_screenshot_allowed(name,'upload'));
create policy support_screenshot_read_fence on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'support-screenshots' or public.support_screenshot_allowed(name,'read'));
create policy support_screenshot_update_fence on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'support-screenshots') with check(bucket_id<>'support-screenshots');
create policy support_screenshot_delete_fence on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'support-screenshots' or public.support_screenshot_allowed(name,'cleanup'));
create function public.finalize_support_screenshot(p_id uuid,p_user_id uuid,p_width integer,p_height integer,p_bytes integer) returns void
language plpgsql security definer set search_path='' as $$
declare t public.support_tickets;
begin
 select * into t from public.support_tickets where id=p_id for update;
 if t.user_id is distinct from p_user_id or not exists(select 1 from auth.users where id=t.user_id and email_confirmed_at is not null) or t.screenshot_path is null then raise exception 'Screenshot owner/session is unavailable.' using errcode='42501';end if;
 if t.screenshot_state='ready' then return;end if;
 if t.created_at<clock_timestamp()-interval '1 day' or p_width is null or p_height is null or p_bytes is null or p_width not between 1 and 2400 or p_height not between 1 and 2400 or p_bytes not between 1 and 5242880
 or not exists(select 1 from storage.objects o where o.bucket_id='support-screenshots' and o.name=t.screenshot_path and o.metadata->>'mimetype'='image/webp' and (o.metadata->>'size')::integer=p_bytes) then raise exception 'Validated screenshot object or dimensions are unavailable.' using errcode='22023';end if;
 update public.support_tickets set screenshot_state='ready',screenshot_width=p_width,screenshot_height=p_height,updated_at=clock_timestamp() where id=p_id;
end;$$;
revoke all on function public.finalize_support_screenshot(uuid,uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.finalize_support_screenshot(uuid,uuid,integer,integer,integer) to service_role;
create function public.support_cleanup_candidates() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from (
 select id,screenshot_path from public.support_tickets where screenshot_state='pending' and created_at<clock_timestamp()-interval '1 day' order by created_at limit 100)c;
$$;
create function public.cleanup_stale_support_screenshot(p_id uuid,p_finish boolean default false) returns text
language plpgsql security definer set search_path='' as $$
declare t public.support_tickets;
begin
 select * into t from public.support_tickets where id=p_id for update;
 -- Expired pending rows cannot finalize/upload, so these exact paths cannot
 -- race into a certified image while the operator deletes their bytes.
 if t.screenshot_state is distinct from 'pending' or t.created_at>=clock_timestamp()-interval '1 day' then return null;end if;
 if p_finish then
  if exists(select 1 from storage.objects where bucket_id='support-screenshots' and name=t.screenshot_path) then raise exception 'Remove exact Storage bytes before finishing cleanup.' using errcode='22023';end if;
  update public.support_tickets set screenshot_state='none',screenshot_path=null,updated_at=clock_timestamp() where id=p_id;
 end if;
 return t.screenshot_path;
end;$$;
revoke all on function public.support_cleanup_candidates(),public.cleanup_stale_support_screenshot(uuid,boolean) from public,anon,authenticated;
grant execute on function public.support_cleanup_candidates(),public.cleanup_stale_support_screenshot(uuid,boolean) to service_role;
commit;
