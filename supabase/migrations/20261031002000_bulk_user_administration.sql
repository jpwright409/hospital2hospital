begin;
-- Keep the original audited per-account protections; distinguish cleanup throughput
-- from email/identity operations. No ordinary account/table grants are expanded.
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
 if (select count(*) from private.account_admin_audit where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 hour')>=200 then raise exception 'Account administration limit reached (200 actions/hour). Try later.' using errcode='22023';end if;
 if p_action in ('invite','reset','email') and (select count(*) from private.account_admin_audit where actor_id=auth.uid() and action in ('invite','reset','email') and created_at>clock_timestamp()-interval '1 hour')>=20 then raise exception 'Email/account identity action limit reached (20/hour). Try later.' using errcode='22023';end if;
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
  if p_action='reset' and (not exists(select 1 from auth.users u where u.id=p_target and u.email_confirmed_at is not null and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()) or exists(select 1 from private.account_controls where user_id=p_target and disabled)) then raise exception 'Reset requires a confirmed, enabled account.' using errcode='22023';end if;
  if p_action='reset' and exists(select 1 from private.account_admin_audit where target_id=p_target and action='reset' and created_at>clock_timestamp()-interval '5 minutes') then raise exception 'A reset was recently requested. Wait five minutes.' using errcode='22023';end if;
 end if;
 if p_action in ('invite','email') and (length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter a valid email address.' using errcode='22023';end if;
 if p_action='email' and exists(select 1 from auth.users where lower(email)=p_email and id<>p_target) then raise exception 'That email already belongs to another account.' using errcode='22023';end if;
 insert into private.account_admin_audit(id,actor_id,target_id,action,email,name,expected_email,reason) values(p_id,auth.uid(),p_target,p_action,p_email,p_name,p_expected_email,p_reason) returning * into a;
 if p_action in ('disable','remove') then insert into private.account_controls(user_id,disabled) values(p_target,true) on conflict(user_id) do update set disabled=true,updated_at=clock_timestamp();end if;
 if p_action='remove' then update private.account_controls set removal_requested_at=clock_timestamp() where user_id=p_target;end if;
 return jsonb_build_object('execute',true,'token',a.claim_token,'email',coalesce(destination,p_email));
end;$$;

create function public.begin_account_bulk_item(p_id uuid,p_action text,p_target uuid,p_expected_email text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_account_administrator();
 if p_action is null or p_action not in ('disable','remove','reset') then raise exception 'Choose disable, remove or reset for a batch.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('account-administration',0));
 perform private.require_account_administrator();
 if p_target=auth.uid() or exists(select 1 from private.platform_administrators where user_id=p_target and active) then raise exception 'Platform administrators and your own account are excluded from bulk actions.' using errcode='42501';end if;
 return public.begin_account_admin_action(p_id,p_action,p_target,'','',p_expected_email,p_reason);
end;$$;
revoke all on function public.begin_account_bulk_item(uuid,text,uuid,text,text) from public,anon;
grant execute on function public.begin_account_bulk_item(uuid,text,uuid,text,text) to authenticated;

create function public.admin_user_directory_v2(p_query text default '',p_page integer default 1,p_status text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_account_administrator();
 if p_page is null or p_page not between 1 and 100000 or length(coalesce(p_query,''))>100 or p_status is null or p_status not in ('all','unconfirmed','confirmed','disabled') then raise exception 'Invalid user search or status filter.' using errcode='22023';end if;
 with accounts as (
  select u.id,u.email,p.display_name,u.email_confirmed_at,
   (coalesce(c.disabled,false) or coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')>now()) as disabled,
   exists(select 1 from private.platform_administrators a where a.user_id=u.id and a.active) as platform_administrator,
   exists(select 1 from public.facilities f where f.owner_user_id=u.id) as facility_owner,
   (select count(*) from public.facility_memberships m where m.user_id=u.id and m.status='active') as facility_count,
   exists(select 1 from private.account_admin_audit a where a.target_id=u.id and a.state in ('requested','uncertain')) or c.removal_requested_at is not null as action_pending,
   (to_jsonb(u)->>'created_at')::timestamptz as created_at,(to_jsonb(u)->>'last_sign_in_at')::timestamptz as last_sign_in_at
  from auth.users u left join public.profiles p on p.id=u.id left join private.account_controls c on c.user_id=u.id
  where to_jsonb(u)->>'deleted_at' is null and c.removed_at is null
   and (coalesce(p_query,'')='' or strpos(lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')),lower(p_query))>0)
 ), filtered as (
  select * from accounts where p_status='all' or (p_status='unconfirmed' and email_confirmed_at is null)
   or (p_status='confirmed' and email_confirmed_at is not null) or (p_status='disabled' and disabled)
 ), paged as (select * from filtered order by created_at desc nulls last,id limit 20 offset (p_page-1)*20)
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(paged) order by created_at desc nulls last,id) from paged),'[]'::jsonb)) into result;
 return result;
end;$$;
revoke all on function public.admin_user_directory_v2(text,integer,text) from public,anon;
grant execute on function public.admin_user_directory_v2(text,integer,text) to authenticated;
commit;
