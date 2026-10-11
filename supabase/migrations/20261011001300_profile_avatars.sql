begin;
-- Small, account-private headshots are stored inline, avoiding public buckets,
-- orphan files and a privileged upload credential. Never accept an image URL.
create function public.valid_profile_avatar(p_image text) returns boolean
language plpgsql immutable set search_path='' as $$
declare bytes bytea;
begin
 if p_image is null then return true; end if;
 if length(p_image)>174800 or p_image !~ '^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$' then return false; end if;
 bytes:=decode(substring(p_image from 24),'base64');
 return octet_length(bytes) between 20 and 131072
  and substring(bytes from 1 for 4)=decode('52494646','hex')
  and substring(bytes from 9 for 4)=decode('57454250','hex')
  and substring(bytes from 13 for 4) in (decode('56503820','hex'),decode('5650384c','hex'),decode('56503858','hex'));
exception when others then return false;
end;$$;
revoke all on function public.valid_profile_avatar(text) from public,anon;
grant execute on function public.valid_profile_avatar(text) to authenticated;
create table public.profile_avatars (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 image_data text not null check(public.valid_profile_avatar(image_data)),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.profile_avatars enable row level security;
create policy avatar_read_self on public.profile_avatars for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.profile_avatars from public,anon,authenticated;
grant select on public.profile_avatars to authenticated;

create function public.update_my_profile(p_name text,p_replace_avatar boolean default false,p_avatar text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
  raise exception 'Log in with a confirmed account to edit your profile.' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 2 and 120 or p_replace_avatar is null then
  raise exception 'Enter a name of 2-120 characters.' using errcode='22023'; end if;
 if p_replace_avatar and not public.valid_profile_avatar(p_avatar) then
  raise exception 'Choose a supported headshot. The saved WebP must be under 128 KB.' using errcode='22023'; end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 update public.profiles set display_name=btrim(p_name) where id=auth.uid();
 if p_replace_avatar then
  if p_avatar is null then delete from public.profile_avatars where user_id=auth.uid();
  else insert into public.profile_avatars(user_id,image_data) values(auth.uid(),p_avatar)
   on conflict(user_id) do update set image_data=excluded.image_data,updated_at=clock_timestamp(); end if;
 end if;
end;$$;
revoke all on function public.update_my_profile(text,boolean,text) from public,anon;
grant execute on function public.update_my_profile(text,boolean,text) to authenticated;

-- Members see only the business contact for their current facility; the backup
-- contact remains subject to the existing owner/administrator-only policy.
create function public.my_active_facility_business_contact() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',c.business_name,'email',c.business_email,'phone',c.business_phone)
 from public.profiles p join public.facility_contacts c on c.facility_id=p.active_facility_id
 join public.facilities f on f.id=c.facility_id
 join public.facility_memberships m on m.facility_id=f.id and m.user_id=p.id
 join auth.users u on u.id=p.id
 where p.id=auth.uid() and u.email_confirmed_at is not null and m.status='active'
 and (m.role<>'owner' or f.owner_user_id=p.id);
$$;
revoke all on function public.my_active_facility_business_contact() from public,anon;
grant execute on function public.my_active_facility_business_contact() to authenticated;
commit;
