begin;
create table public.facility_contacts (
 facility_id uuid primary key references public.facilities on delete cascade,
 business_name text not null default '' check(length(business_name)<=120),
 business_email text not null default '' check(length(business_email)<=254),
 business_phone text not null default '' check(length(business_phone)<=40),
 secondary_name text not null default '' check(length(secondary_name)<=120),
 secondary_email text not null default '' check(length(secondary_email)<=254),
 secondary_phone text not null default '' check(length(secondary_phone)<=40),
 share_business_contact boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.facility_contacts enable row level security;
create function public.can_manage_facility_contacts(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.facilities f join public.facility_memberships m on m.facility_id=f.id
 join auth.users u on u.id=m.user_id where f.id=p_id and m.user_id=auth.uid() and m.status='active'
 and u.email_confirmed_at is not null and (m.role='administrator' or (m.role='owner' and f.owner_user_id=auth.uid())));
$$;
revoke all on function public.can_manage_facility_contacts(uuid) from public,anon;
grant execute on function public.can_manage_facility_contacts(uuid) to authenticated;
create policy contacts_private on public.facility_contacts for select to authenticated using(public.can_manage_facility_contacts(facility_id));
revoke all on public.facility_contacts from public,anon,authenticated;
grant select on public.facility_contacts to authenticated;
create function public.set_facility_contacts(p_id uuid,p_contact jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.facilities where id=p_id for share;
 perform 1 from public.facility_memberships where facility_id=p_id and user_id=auth.uid() for share;
 if not public.can_manage_facility_contacts(p_id) then raise exception 'An active facility owner or administrator is required.' using errcode='42501'; end if;
 if coalesce((p_contact->>'share_business_contact')::boolean,false) and coalesce(p_contact->>'business_email','')='' and coalesce(p_contact->>'business_phone','')='' then
 raise exception 'Provide a business email or phone before sharing a contact.' using errcode='22023'; end if;
 if coalesce(p_contact->>'business_email','')<>'' and p_contact->>'business_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or coalesce(p_contact->>'secondary_email','')<>'' and p_contact->>'secondary_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
 raise exception 'Enter valid business and secondary email addresses, or leave them blank.' using errcode='22023'; end if;
 insert into public.facility_contacts(facility_id,business_name,business_email,business_phone,secondary_name,secondary_email,secondary_phone,share_business_contact)
 values(p_id,coalesce(p_contact->>'business_name',''),coalesce(p_contact->>'business_email',''),coalesce(p_contact->>'business_phone',''),
 coalesce(p_contact->>'secondary_name',''),coalesce(p_contact->>'secondary_email',''),coalesce(p_contact->>'secondary_phone',''),coalesce((p_contact->>'share_business_contact')::boolean,false))
 on conflict(facility_id) do update set business_name=excluded.business_name,business_email=excluded.business_email,business_phone=excluded.business_phone,
 secondary_name=excluded.secondary_name,secondary_email=excluded.secondary_email,secondary_phone=excluded.secondary_phone,
 share_business_contact=excluded.share_business_contact,updated_at=clock_timestamp();
end;$$;
create function public.listing_business_contact(p_listing_id uuid,p_buyer_facility_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.conversation_member(p_buyer_facility_id) then raise exception 'Select an approved buyer facility with conversation permission.' using errcode='42501'; end if;
 return (select jsonb_build_object('name',c.business_name,'email',c.business_email,'phone',c.business_phone)
 from public.facility_contacts c join public.listings l on l.facility_id=c.facility_id where l.id=p_listing_id
 and c.share_business_contact and l.status='active' and l.deleted_at is null and public.facility_is_public(l.facility_id) and l.facility_id<>p_buyer_facility_id);
end;$$;
revoke all on function public.set_facility_contacts(uuid,jsonb),public.listing_business_contact(uuid,uuid) from public,anon;
grant execute on function public.set_facility_contacts(uuid,jsonb),public.listing_business_contact(uuid,uuid) to authenticated;
create function public.onboard_facility_with_contacts(p_name text,p_city text,p_state text,p_facility_type text,p_request_id uuid,p_contact jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare fid uuid;existing_owner uuid;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirm your account before onboarding.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select id,owner_user_id into fid,existing_owner from public.facilities where onboarding_request_id=p_request_id;
 if fid is not null then
  if existing_owner is distinct from auth.uid() then raise exception 'Onboarding request unavailable.' using errcode='42501'; end if;
  return fid;
 end if;
 fid:=public.onboard_facility(p_name,p_city,p_state,p_facility_type,p_request_id);
 perform public.set_facility_contacts(fid,p_contact);
 return fid;
end;$$;
revoke all on function public.onboard_facility_with_contacts(text,text,text,text,uuid,jsonb) from public,anon;
grant execute on function public.onboard_facility_with_contacts(text,text,text,text,uuid,jsonb) to authenticated;
commit;
