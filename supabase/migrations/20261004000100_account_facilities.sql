begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  active_facility_id uuid,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  city text not null check (char_length(btrim(city)) between 2 and 100),
  state text not null check (state ~ '^[A-Z]{2}$'),
  facility_type text not null check (facility_type in ('hospital', 'surgery_center')),
  owner_user_id uuid not null references auth.users(id),
  onboarding_request_id uuid not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_at timestamptz,
  review_reason text check (char_length(review_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.facilities enable row level security;
revoke all on public.facilities from public, anon, authenticated;
grant select on public.facilities to authenticated;
alter table public.profiles add constraint profiles_active_facility_fk
  foreign key (active_facility_id) references public.facilities(id) on delete set null;

create table public.facility_memberships (
  facility_id uuid not null references public.facilities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'administrator', 'inventory_editor', 'viewer')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (facility_id, user_id)
);
create index facility_memberships_user_idx on public.facility_memberships(user_id, status);
create index facilities_status_idx on public.facilities(status, created_at);
alter table public.facility_memberships enable row level security;
revoke all on public.facility_memberships from public, anon, authenticated;
grant select on public.facility_memberships to authenticated;
create policy memberships_read_self on public.facility_memberships for select to authenticated
  using (user_id = (select auth.uid()));

-- Security-definer helpers avoid recursive membership policies. No user-supplied
-- identity is accepted. All object references are qualified and search_path fixed.
create function public.is_facility_member(p_facility_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.facility_memberships m
    where m.facility_id = p_facility_id and m.user_id = auth.uid() and m.status = 'active');
$$;
revoke all on function public.is_facility_member(uuid) from public, anon, authenticated;
grant execute on function public.is_facility_member(uuid) to authenticated;
create policy facilities_read_member on public.facilities for select to authenticated
  using (public.is_facility_member(id));

create function public.facility_can_publish(p_facility_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.facility_memberships m join public.facilities f on f.id = m.facility_id
    where m.facility_id = p_facility_id and m.user_id = auth.uid() and m.status = 'active'
    and f.status = 'approved' and m.role in ('owner', 'administrator', 'inventory_editor'));
$$;
create function public.facility_can_inquire(p_facility_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.facility_memberships m join public.facilities f on f.id = m.facility_id
    where m.facility_id = p_facility_id and m.user_id = auth.uid() and m.status = 'active' and f.status = 'approved');
$$;
revoke all on function public.facility_can_publish(uuid), public.facility_can_inquire(uuid) from public, anon, authenticated;
grant execute on function public.facility_can_publish(uuid), public.facility_can_inquire(uuid) to authenticated;

create function private.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 120));
  return new;
end;
$$;
revoke all on function private.create_profile_for_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.create_profile_for_user();
-- Backfill users who existed before this migration. Metadata never supplies roles.
insert into public.profiles(id, display_name)
  select id, left(coalesce(raw_user_meta_data ->> 'display_name', ''), 120) from auth.users
  on conflict (id) do nothing;

create function public.onboard_facility(p_name text, p_city text, p_state text, p_facility_type text, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_facility uuid;
  v_owner uuid;
begin
  if v_user is null or not exists(select 1 from auth.users where id = v_user and email_confirmed_at is not null) then
    raise exception 'A confirmed account is required.' using errcode = '42501';
  end if;
  if p_request_id is null or p_name is null or char_length(btrim(p_name)) not between 2 and 160
    or p_city is null or char_length(btrim(p_city)) not between 2 and 100
    or p_state is null or upper(btrim(p_state)) !~ '^[A-Z]{2}$'
    or p_facility_type is null or p_facility_type not in ('hospital', 'surgery_center') then
    raise exception 'Enter a facility name, city, two-letter state, and valid facility type.' using errcode = '22023';
  end if;
  -- Idempotent submission: retrying one form never creates two facilities.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select id, owner_user_id into v_facility, v_owner from public.facilities where onboarding_request_id = p_request_id;
  if v_facility is not null then
    if v_owner <> v_user then raise exception 'This onboarding request is unavailable.' using errcode = '42501'; end if;
    return v_facility;
  end if;
  insert into public.facilities(name, city, state, facility_type, owner_user_id, onboarding_request_id)
    values (btrim(p_name), btrim(p_city), upper(btrim(p_state)), p_facility_type, v_user, p_request_id)
    returning id into v_facility;
  insert into public.facility_memberships(facility_id, user_id, role) values (v_facility, v_user, 'owner');
  insert into public.profiles(id) values (v_user) on conflict (id) do nothing;
  update public.profiles set active_facility_id = v_facility where id = v_user;
  return v_facility;
end;
$$;
revoke all on function public.onboard_facility(text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.onboard_facility(text,text,text,text,uuid) to authenticated;

create function public.set_active_facility(p_facility_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_facility_member(p_facility_id) then
    raise exception 'Choose a facility where you have an active membership.' using errcode = '42501';
  end if;
  -- Pending/suspended facilities can be selected to view status. This does not
  -- grant publishing or inquiry privileges; those require live approval checks.
  update public.profiles set active_facility_id = p_facility_id where id = auth.uid();
  if not found then raise exception 'Account profile not found.' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.set_active_facility(uuid) from public, anon, authenticated;
grant execute on function public.set_active_facility(uuid) to authenticated;

commit;
