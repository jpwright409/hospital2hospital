begin;

-- Not in the exposed public schema; not writable from any ordinary API client.
create table private.platform_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  bootstrap_reason text not null check (char_length(btrim(bootstrap_reason)) >= 10),
  created_at timestamptz not null default now()
);
alter table private.platform_administrators enable row level security;
revoke all on private.platform_administrators from public, anon, authenticated;

create table private.facility_approval_audit (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  actor_user_id uuid not null references auth.users(id),
  previous_status text not null,
  new_status text not null,
  reason text,
  created_at timestamptz not null default now()
);
alter table private.facility_approval_audit enable row level security;
revoke all on private.facility_approval_audit from public, anon, authenticated;

create function public.is_platform_administrator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.platform_administrators
    where user_id = auth.uid() and active);
$$;
revoke all on function public.is_platform_administrator() from public, anon, authenticated;
grant execute on function public.is_platform_administrator() to authenticated;
create policy facilities_read_platform_admin on public.facilities for select to authenticated
  using (public.is_platform_administrator());

create function public.review_facility(p_facility_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous text;
begin
  if auth.uid() is null or not public.is_platform_administrator() then
    raise exception 'Platform administrator permission is required.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected', 'suspended') then
    raise exception 'Choose approved, rejected, or suspended.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_reason, '')) > 1000
    or (p_status in ('rejected', 'suspended') and char_length(btrim(coalesce(p_reason, ''))) < 10) then
    raise exception 'Provide a reason of 10–1000 characters for rejection or suspension.' using errcode = '22023';
  end if;
  select status into v_previous from public.facilities where id = p_facility_id for update;
  if not found then raise exception 'Facility not found.' using errcode = '22023'; end if;
  update public.facilities set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(),
    approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
    review_reason = nullif(btrim(p_reason), ''), updated_at = now()
    where id = p_facility_id;
  insert into private.facility_approval_audit(facility_id, actor_user_id, previous_status, new_status, reason)
    values (p_facility_id, auth.uid(), v_previous, p_status, nullif(btrim(p_reason), ''));
end;
$$;
revoke all on function public.review_facility(uuid,text,text) from public, anon, authenticated;
grant execute on function public.review_facility(uuid,text,text) to authenticated;

commit;
