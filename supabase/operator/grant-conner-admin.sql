begin;
do $$
declare target uuid;
begin
 select id into strict target from auth.users where lower(email)='conner@babursolutions.com';
 if not exists(select 1 from auth.users u where u.id=target and email_confirmed_at is not null and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()) then
  raise exception 'Conner must confirm his registered account and must not be banned before promotion.';
 end if;
 insert into private.platform_administrators(user_id,active,bootstrap_reason)
 values(target,true,'Explicit owner request: grant Conner platform administrator access on 2026-10-21')
 on conflict(user_id) do update set active=true,bootstrap_reason=excluded.bootstrap_reason;
end $$;
commit;
