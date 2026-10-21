begin;
create table private.account_controls (
 user_id uuid primary key references auth.users on delete cascade,disabled boolean not null default false,
 updated_at timestamptz not null default clock_timestamp()
);
alter table private.account_controls enable row level security;
revoke all on private.account_controls from public,anon,authenticated;
create function public.account_access_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid()
 and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()
 and not exists(select 1 from private.account_controls c where c.user_id=u.id and c.disabled));
$$;
revoke all on function public.account_access_enabled() from public,anon;
grant execute on function public.account_access_enabled() to authenticated;
create function private.require_enabled_account() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is not null and not public.account_access_enabled() then raise exception 'This account is disabled. Contact support.' using errcode='42501';end if;
end;$$;
revoke all on function private.require_enabled_account() from public,anon,authenticated;

-- Preserve existing function OIDs/grants/dependencies while adding the live
-- account gate to every existing app SECURITY DEFINER entry point. Merely
-- replacing public wrappers would leave policies referencing unguarded old OIDs.
do $$
declare f record;body text;definition text;
begin
 for f in select p.oid,p.prosrc,p.proretset,l.lanname,pg_get_functiondef(p.oid) as definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname='public' and p.prosecdef
 and p.proname=any(array[
 'arrange_listing_photos',
 'boost_review_queue',
 'can_manage_facility_contacts',
 'claim_email_jobs',
 'claim_photo_cleanup',
 'cleanup_stale_support_screenshot',
 'contact_listing_seller',
 'conversation_access',
 'conversation_member',
 'conversation_page',
 'create_inventory_draft',
 'create_inventory_listing',
 'delete_inventory_listing',
 'discard_listing_setup',
 'facility_can_inquire',
 'facility_can_publish',
 'facility_inbox',
 'facility_is_public',
 'finalize_listing_photo',
 'finalize_support_screenshot',
 'finish_email_job',
 'finish_photo_cleanup',
 'inventory_can_view',
 'inventory_filter_options',
 'is_facility_member',
 'is_listing_saved',
 'is_platform_administrator',
 'listing_business_contact',
 'mark_conversation_read',
 'mark_saved_listing_updates_read',
 'marketplace_facility',
 'my_active_facility_business_contact',
 'my_boost_options',
 'my_message_facilities',
 'my_saved_listing_update_count',
 'my_saved_listing_updates',
 'normalize_identity',
 'onboard_facility',
 'onboard_facility_with_contacts',
 'photo_can_manage',
 'photo_can_read',
 'photo_object_allowed',
 'prepare_listing_wizard',
 'public_featured_inventory',
 'public_featured_listing_ids',
 'publish_listing_wizard',
 'refer_facility',
 'remove_listing_photo',
 'reply_to_conversation',
 'request_listing_boost',
 'reserve_listing_photo',
 'reserve_listing_photo_once',
 'review_facility',
 'review_listing_boost',
 'review_product_reference',
 'save_listing_wizard',
 'search_inventory',
 'search_inventory_v2',
 'select_message_facility',
 'set_active_facility',
 'set_facility_contacts',
 'set_support_ticket_status',
 'submit_product_reference',
 'submit_support_ticket',
 'support_cleanup_candidates',
 'support_screenshot_allowed',
 'unavailable_saved_listings',
 'update_inventory_listing',
 'update_my_profile',
 'valid_profile_avatar',
 'wizard_can_manage'
 ]) and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') loop
  if f.proretset then raise exception 'Account gate requires explicit review for set-returning function %',f.oid;end if;
  if f.lanname='plpgsql' then
   body:=regexp_replace(f.prosrc,'\mbegin\M','begin perform private.require_enabled_account();','i');
   if body=f.prosrc then raise exception 'Unable to guard function %',f.oid;end if;
   definition:=replace(f.definition,f.prosrc,body);
  elsif f.lanname='sql' then
   body:='begin perform private.require_enabled_account(); return ('||regexp_replace(f.prosrc,';[[:space:]]*$','')||'); end;';
   definition:=replace(replace(f.definition,'LANGUAGE sql','LANGUAGE plpgsql'),f.prosrc,body);
  else raise exception 'Unsupported account gate language %',f.lanname;
  end if;
  execute definition;
 end loop;
 -- Restrictive policies also cover direct table requests, not only RPCs.
 for f in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relrowsecurity and c.relkind='r' and (n.nspname='public' or (n.nspname='storage' and c.relname='objects')) loop
  execute format('create policy enabled_account_required on %I.%I as restrictive for all to authenticated using (public.account_access_enabled()) with check (public.account_access_enabled())',f.nspname,f.relname);
 end loop;
end $$;

create table private.account_admin_audit (
 id uuid primary key,actor_id uuid not null references auth.users,target_id uuid references auth.users,
 action text not null check(action in ('invite','email','disable','enable','reset')),
 email text not null,name text not null default '',expected_email text not null default '',reason text not null,
 state text not null default 'requested' check(state in ('requested','succeeded','failed','uncertain')),
 claim_token uuid not null default gen_random_uuid(),created_at timestamptz not null default clock_timestamp(),finished_at timestamptz
);
alter table private.account_admin_audit enable row level security;
revoke all on private.account_admin_audit from public,anon,authenticated;
create index account_admin_actor_time on private.account_admin_audit(actor_id,created_at desc);
create function private.require_account_administrator() returns void language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_enabled_account();
 if auth.uid() is null or not public.is_platform_administrator() or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Platform administrator permission is required.' using errcode='42501';end if;
end;$$;
revoke all on function private.require_account_administrator() from public,anon,authenticated;
create function public.admin_user_directory(p_query text default '',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_account_administrator();
 if p_page is null or p_page not between 1 and 100000 or length(coalesce(p_query,''))>100 then raise exception 'Invalid user search.' using errcode='22023';end if;
 select jsonb_build_object('total',count(*)) into result from auth.users u left join public.profiles p on p.id=u.id
 where coalesce(p_query,'')='' or strpos(lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')),lower(p_query))>0;
 return result||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(rows) order by rows.email,rows.id),'[]'::jsonb) from (
 select u.id,u.email,p.display_name,u.email_confirmed_at,
 (coalesce(c.disabled,false) or coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')>now()) as disabled,
 exists(select 1 from private.platform_administrators a where a.user_id=u.id and a.active) as platform_administrator
 from auth.users u left join public.profiles p on p.id=u.id left join private.account_controls c on c.user_id=u.id
 where coalesce(p_query,'')='' or strpos(lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')),lower(p_query))>0
 order by u.email,u.id limit 20 offset (p_page-1)*20) rows));
end;$$;
revoke all on function public.admin_user_directory(text,integer) from public,anon;
grant execute on function public.admin_user_directory(text,integer) to authenticated;

create function public.begin_account_admin_action(p_id uuid,p_action text,p_target uuid,p_email text,p_name text,p_expected_email text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.account_admin_audit;destination text;
begin
 perform private.require_account_administrator();
 p_email:=lower(btrim(coalesce(p_email,'')));p_name:=btrim(coalesce(p_name,''));p_expected_email:=lower(btrim(coalesce(p_expected_email,'')));p_reason:=btrim(coalesce(p_reason,''));
 if p_id is null or p_action is null or p_action not in ('invite','email','disable','enable','reset') or length(p_reason) not between 10 and 500 then raise exception 'Choose an action and provide a reason of 10-500 characters.' using errcode='22023';end if;
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
  if p_action<>'reset' and (p_target=auth.uid() or exists(select 1 from private.platform_administrators where user_id=p_target and active)) then raise exception 'Your own account and platform administrators are protected. Use the trusted operator process for administrator email/status changes.' using errcode='42501';end if;
  if exists(select 1 from private.account_admin_audit where target_id=p_target and state in ('requested','uncertain')) then raise exception 'An operation is unresolved for this account. Check the audit before retrying.' using errcode='22023';end if;
  if p_action='reset' and (not exists(select 1 from auth.users where id=p_target and email_confirmed_at is not null) or exists(select 1 from private.account_controls where user_id=p_target and disabled)) then raise exception 'Reset requires a confirmed, enabled account.' using errcode='22023';end if;
  if p_action='reset' and exists(select 1 from private.account_admin_audit where target_id=p_target and action='reset' and created_at>clock_timestamp()-interval '5 minutes') then raise exception 'A reset was recently requested. Wait five minutes.' using errcode='22023';end if;
 end if;
 if p_action in ('invite','email') and (length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter a valid email address.' using errcode='22023';end if;
 if p_action='email' and exists(select 1 from auth.users where lower(email)=p_email and id<>p_target) then raise exception 'That email already belongs to another account.' using errcode='22023';end if;
 insert into private.account_admin_audit(id,actor_id,target_id,action,email,name,expected_email,reason) values(p_id,auth.uid(),p_target,p_action,p_email,p_name,p_expected_email,p_reason) returning * into a;
 if p_action='disable' then insert into private.account_controls(user_id,disabled) values(p_target,true) on conflict(user_id) do update set disabled=true,updated_at=clock_timestamp();end if;
 return jsonb_build_object('execute',true,'token',a.claim_token,'email',coalesce(destination,p_email));
end;$$;
revoke all on function public.begin_account_admin_action(uuid,text,uuid,text,text,text,text) from public,anon;
grant execute on function public.begin_account_admin_action(uuid,text,uuid,text,text,text,text) to authenticated;

create function public.finish_account_admin_action(p_id uuid,p_token uuid,p_success boolean,p_created_user uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare a private.account_admin_audit;
begin
 select * into a from private.account_admin_audit where id=p_id for update;
 if a.id is null or a.claim_token is distinct from p_token or a.state<>'requested' then raise exception 'Account operation unavailable.' using errcode='42501';end if;
 -- Only enable after Auth has removed its ban. Disable remains fail-closed even if Auth failed.
 if p_success and a.action='enable' then
  if not exists(select 1 from private.platform_administrators where user_id=a.actor_id and active) or exists(select 1 from private.account_controls where user_id=a.actor_id and disabled) then raise exception 'The acting administrator no longer has access.' using errcode='42501';end if;
  if exists(select 1 from auth.users u where id=a.target_id and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')>now()) then raise exception 'Auth still reports this account banned.' using errcode='22023';end if;
  insert into private.account_controls(user_id,disabled) values(a.target_id,false) on conflict(user_id) do update set disabled=false,updated_at=clock_timestamp();
 end if;
 update private.account_admin_audit set state=case when p_success is null then 'uncertain' when p_success then 'succeeded' else 'failed' end,finished_at=clock_timestamp(),target_id=case when action='invite' and p_success then p_created_user else target_id end where id=p_id;
end;$$;
revoke all on function public.finish_account_admin_action(uuid,uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.finish_account_admin_action(uuid,uuid,boolean,uuid) to service_role;
create function public.admin_account_audit() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_account_administrator();
 return (select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc,rows.id),'[]'::jsonb) from
 (select id,actor_id,target_id,action,coalesce(nullif(email,''),expected_email) as email,reason,state,created_at,finished_at from private.account_admin_audit order by created_at desc,id limit 50) rows);
end;$$;
revoke all on function public.admin_account_audit() from public,anon;
grant execute on function public.admin_account_audit() to authenticated;
commit;
