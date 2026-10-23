begin;
-- Permanent Auth soft removal preserves foreign keys and shared history.
alter table private.account_controls add column removal_requested_at timestamptz,add column removed_at timestamptz;
alter table private.account_admin_audit drop constraint account_admin_audit_action_check;
alter table private.account_admin_audit add constraint account_admin_audit_action_check check(action in ('invite','email','disable','enable','reset','remove'));
create or replace function public.account_access_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid() and to_jsonb(u)->>'deleted_at' is null
 and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()
 and not exists(select 1 from private.account_controls c where c.user_id=u.id and (c.disabled or c.removal_requested_at is not null or c.removed_at is not null)));
$$;
create or replace function public.admin_user_directory(p_query text default '',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_account_administrator();
 if p_page is null or p_page not between 1 and 100000 or length(coalesce(p_query,''))>100 then raise exception 'Invalid user search.' using errcode='22023';end if;
 select jsonb_build_object('total',count(*)) into result from auth.users u left join public.profiles p on p.id=u.id
 where to_jsonb(u)->>'deleted_at' is null and not exists(select 1 from private.account_controls removed where removed.user_id=u.id and removed.removed_at is not null) and (coalesce(p_query,'')='' or strpos(lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')),lower(p_query))>0);
 return result||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(rows) order by rows.email,rows.id),'[]'::jsonb) from (
 select u.id,u.email,p.display_name,u.email_confirmed_at,
 (coalesce(c.disabled,false) or coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')>now()) as disabled,
 exists(select 1 from private.platform_administrators a where a.user_id=u.id and a.active) as platform_administrator
 from auth.users u left join public.profiles p on p.id=u.id left join private.account_controls c on c.user_id=u.id
 where to_jsonb(u)->>'deleted_at' is null and not exists(select 1 from private.account_controls removed where removed.user_id=u.id and removed.removed_at is not null) and (coalesce(p_query,'')='' or strpos(lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')),lower(p_query))>0)
 order by u.email,u.id limit 20 offset (p_page-1)*20) rows));
end;$$;

create or replace function public.begin_account_admin_action(p_id uuid,p_action text,p_target uuid,p_email text,p_name text,p_expected_email text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.account_admin_audit;destination text;
begin
 perform private.require_account_administrator();
 p_email:=lower(btrim(coalesce(p_email,'')));p_name:=btrim(coalesce(p_name,''));p_expected_email:=lower(btrim(coalesce(p_expected_email,'')));p_reason:=btrim(coalesce(p_reason,''));
 if p_id is null or p_action is null or p_action not in ('invite','email','disable','enable','reset','remove') or length(p_reason) not between 10 and 500 then raise exception 'Choose an action and provide a reason of 10-500 characters.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('account-administration',0));
 -- Permissions may have changed while waiting for another administrator.
 perform private.require_account_administrator();
 select * into a from private.account_admin_audit where id=p_id;
 if found then
  if a.actor_id<>auth.uid() or a.action<>p_action or (p_action<>'invite' and a.target_id is distinct from p_target) or a.email<>p_email or a.name<>p_name or a.expected_email<>p_expected_email or a.reason<>p_reason then raise exception 'Submission identity changed.' using errcode='42501';end if;
  return jsonb_build_object('execute',false,'state',a.state);
 end if;
 if (select count(*) from private.account_admin_audit where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 hour')>=20 then raise exception 'Account administration limit reached. Try later.' using errcode='22023';end if;
 if p_action='invite' then
  if p_target is not null or length(p_name) not between 2 and 120 then raise exception 'Enter a name of 2-120 characters.' using errcode='22023';end if;
  if exists(select 1 from auth.users where lower(email)=p_email) then raise exception 'An account already exists for that email. Use its existing account controls.' using errcode='22023';end if;
  if exists(select 1 from private.account_admin_audit where action='invite' and email=p_email and state in ('requested','uncertain')) then raise exception 'An invitation is unresolved for this email. Check the audit before retrying.' using errcode='22023';end if;
 else
  select lower(email) into destination from auth.users where id=p_target;
  if destination is null or destination<>p_expected_email then raise exception 'Account changed. Refresh before continuing.' using errcode='22023';end if;
  if exists(select 1 from private.account_controls where user_id=p_target and (removed_at is not null or removal_requested_at is not null)) or exists(select 1 from auth.users u where u.id=p_target and to_jsonb(u)->>'deleted_at' is not null) then raise exception 'This account was removed or removal is unresolved. Use the audit and trusted operator process.' using errcode='22023';end if;
  if p_action='remove' and exists(select 1 from public.facilities where owner_user_id=p_target) then raise exception 'Transfer facility ownership through the trusted operator process before removing this account.' using errcode='22023';end if;
  if p_action<>'reset' and (p_target=auth.uid() or exists(select 1 from private.platform_administrators where user_id=p_target and active)) then raise exception 'Your own account and platform administrators are protected. Use the trusted operator process for administrator email/status changes.' using errcode='42501';end if;
  if exists(select 1 from private.account_admin_audit where target_id=p_target and state in ('requested','uncertain')) then raise exception 'An operation is unresolved for this account. Check the audit before retrying.' using errcode='22023';end if;
  if p_action='reset' and (not exists(select 1 from auth.users where id=p_target and email_confirmed_at is not null) or exists(select 1 from private.account_controls where user_id=p_target and disabled)) then raise exception 'Reset requires a confirmed, enabled account.' using errcode='22023';end if;
  if p_action='reset' and exists(select 1 from private.account_admin_audit where target_id=p_target and action='reset' and created_at>clock_timestamp()-interval '5 minutes') then raise exception 'A reset was recently requested. Wait five minutes.' using errcode='22023';end if;
 end if;
 if p_action in ('invite','email') and (length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter a valid email address.' using errcode='22023';end if;
 if p_action='email' and exists(select 1 from auth.users where lower(email)=p_email and id<>p_target) then raise exception 'That email already belongs to another account.' using errcode='22023';end if;
 insert into private.account_admin_audit(id,actor_id,target_id,action,email,name,expected_email,reason) values(p_id,auth.uid(),p_target,p_action,p_email,p_name,p_expected_email,p_reason) returning * into a;
 if p_action in ('disable','remove') then insert into private.account_controls(user_id,disabled) values(p_target,true) on conflict(user_id) do update set disabled=true,updated_at=clock_timestamp();end if;
 if p_action='remove' then update private.account_controls set removal_requested_at=clock_timestamp() where user_id=p_target;end if;
 return jsonb_build_object('execute',true,'token',a.claim_token,'email',coalesce(destination,p_email));
end;$$;

-- Service must revalidate the exact live claim immediately before Auth removal.
create function public.authorize_account_removal(p_id uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare a private.account_admin_audit;
begin
 perform pg_advisory_xact_lock(hashtextextended('account-administration',0));
 select * into a from private.account_admin_audit where id=p_id for update;
 if a.id is null or a.claim_token is distinct from p_token or a.action<>'remove' or a.state<>'requested' then raise exception 'Removal claim unavailable.' using errcode='42501';end if;
 if not exists(select 1 from private.platform_administrators pa join auth.users u on u.id=pa.user_id where pa.user_id=a.actor_id and pa.active and u.email_confirmed_at is not null and to_jsonb(u)->>'deleted_at' is null and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now() and not exists(select 1 from private.account_controls where user_id=u.id and disabled)) then raise exception 'Acting administrator no longer authorized.' using errcode='42501';end if;
 if a.target_id=a.actor_id or exists(select 1 from private.platform_administrators where user_id=a.target_id and active) or exists(select 1 from public.facilities where owner_user_id=a.target_id) then raise exception 'Account is protected or owns a facility.' using errcode='42501';end if;
 if not exists(select 1 from auth.users u where u.id=a.target_id and lower(u.email)=a.expected_email and to_jsonb(u)->>'deleted_at' is null) then raise exception 'Target account changed.' using errcode='42501';end if;
end;$$;
revoke all on function public.authorize_account_removal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.authorize_account_removal(uuid,uuid) to service_role;
create or replace function public.finish_account_admin_action(p_id uuid,p_token uuid,p_success boolean,p_created_user uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare a private.account_admin_audit;
begin
 select * into a from private.account_admin_audit where id=p_id for update;
 if a.id is null or a.claim_token is distinct from p_token or a.state<>'requested' then raise exception 'Account operation unavailable.' using errcode='42501';end if;
 -- Only enable after Auth has removed its ban. Disable remains fail-closed even if Auth failed.
 if p_success and a.action='remove' then
  if not exists(select 1 from auth.users u where u.id=a.target_id and to_jsonb(u)->>'deleted_at' is not null) then raise exception 'Auth removal is not confirmed. Reconcile before retrying.' using errcode='22023';end if;
  update private.account_controls set removed_at=clock_timestamp(),disabled=true,updated_at=clock_timestamp() where user_id=a.target_id;
  update public.facility_memberships set status='revoked' where user_id=a.target_id;
  update public.profiles set display_name='Removed user',active_facility_id=null where id=a.target_id;
  delete from public.profile_avatars where user_id=a.target_id;
  delete from public.saved_listings where user_id=a.target_id;
  delete from public.watchlists where user_id=a.target_id;
  update private.email_jobs set state='cancelled' where user_id=a.target_id and state in ('pending','sending');
 end if;
 if p_success and a.action='enable' then
  if not exists(select 1 from private.platform_administrators where user_id=a.actor_id and active) or exists(select 1 from private.account_controls where user_id=a.actor_id and disabled) then raise exception 'The acting administrator no longer has access.' using errcode='42501';end if;
  if exists(select 1 from auth.users u where id=a.target_id and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')>now()) then raise exception 'Auth still reports this account banned.' using errcode='22023';end if;
  if exists(select 1 from private.account_controls where user_id=a.target_id and (removed_at is not null or removal_requested_at is not null)) then raise exception 'Removed accounts cannot be enabled.' using errcode='42501';end if;
  insert into private.account_controls(user_id,disabled) values(a.target_id,false) on conflict(user_id) do update set disabled=false,updated_at=clock_timestamp();
 end if;
 update private.account_admin_audit set state=case when p_success is null then 'uncertain' when p_success then 'succeeded' else 'failed' end,finished_at=clock_timestamp(),target_id=case when action='invite' and p_success then p_created_user else target_id end where id=p_id;
end;$$;

commit;
