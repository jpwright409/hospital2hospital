begin;
-- Owner-provided reference names only; no products, stock or aliases inferred.
insert into public.manufacturers(name) values
('Acclarent'),
('Anspach'),
('Applied Medical'),
('Arthrex'),
('Bard'),
('Baxter'),
('Boston Scientific'),
('ConMed'),
('Cook Medical'),
('Cooper Surgical'),
('Covidien'),
('Depuy'),
('Ethicon'),
('Gore'),
('Gyrus ACMI'),
('Hologic'),
('Integra'),
('Intuitive'),
('Karl Storz'),
('Medtronic'),
('Olympus'),
('Richard Wolf'),
('Smith & Nephew'),
('Stryker'),
('Teleflex'),
('Zimmer Biomet'),
('3M'),
('A&E Medical Corporation'),
('Abbott'),
('Abeon'),
('Accutome'),
('ACRA-CUT'),
('Active Medical'),
('Acumed'),
('Advanced Medical'),
('Aerin Medical'),
('Aesculap'),
('Alcon'),
('Allen Medical'),
('Allergan'),
('Ambler Surgical'),
('Ambu'),
('Amendia'),
('American Medical Systems'),
('Anchor'),
('AngioDynamics'),
('Angiotech'),
('Anulex'),
('Apollo Endosurgery'),
('Argon'),
('Arrow International'),
('Arthrocare'),
('Arthrotek'),
('Asahi'),
('Aspen Surgical'),
('Aspide'),
('ATOS Medical'),
('AtriCure'),
('Atrium Med'),
('Avanos'),
('Axiom Medical'),
('Axonics'),
('Barrx Medical'),
('Bausch & Lomb'),
('Bayer Medical'),
('Baylis'),
('BD'),
('Beaver'),
('Becton Dickinson'),
('BihlerMed'),
('Bio-Med Devices'),
('BioCer'),
('Biocomposites'),
('Biomet'),
('BioPro'),
('Biosense Webster'),
('Boss'),
('Bovie Medical'),
('Brasseler'),
('Braun'),
('BSN Medical'),
('Busse'),
('Caldera Medical'),
('Cardinal Health'),
('Cardiovascular Systems'),
('CareFusion'),
('Cayenne Medical'),
('Centurion'),
('Ceterix'),
('Chemence'),
('Civco'),
('CL Medical'),
('Clinical Innovations'),
('Codman'),
('Coloplast'),
('ConvaTec'),
('Coolief'),
('Cordis'),
('Cryolife'),
('CSI'),
('CVRx'),
('Davol'),
('DeRoyal'),
('DJO Global'),
('DORC'),
('Dornier MedTech'),
('DuraStat'),
('Dyonics'),
('Eagle Labs'),
('East Coast Surgical'),
('Edwards LifeSciences'),
('Elekta'),
('Encision'),
('EndoEvolution'),
('EpiMed'),
('Erbe'),
('Essure'),
('Ev3'),
('Exactech'),
('FCI'),
('Fisher & Paykel'),
('FMS'),
('Galatea'),
('Galt Medical'),
('GE'),
('Genicon'),
('GI?Supply, Inc'),
('Glaukos'),
('Globus Medical, Inc.'),
('GraceMed'),
('Great South Surgical'),
('Greatbatch'),
('Greer Medical'),
('Greiner Bio-One'),
('Guangzhou Harley Commodity'),
('Gynecare'),
('Haemonetics'),
('Halyard Health'),
('Havel''s Incorporated'),
('Hemostasis'),
('Hemostatix'),
('Heraeus Medical'),
('Herniamesh'),
('Hobbs Medical'),
('Hollister'),
('Hospira'),
('Howmedica'),
('HydroCision'),
('Imran Surgical'),
('Inion'),
('Insightra Medical, Inc'),
('Instratek'),
('Invotec International'),
('Katena'),
('KCI'),
('Kimberly Clark'),
('Kirwan Surgical Products'),
('Laborie'),
('Labtician'),
('Leemac'),
('Leica'),
('Lemaitre'),
('Lexington Medical'),
('Lexion'),
('Lifenet Health'),
('LiNA'),
('Linvatec'),
('LivaNova PLC'),
('LSI Solutions'),
('Mallinckrodt'),
('Maquet'),
('Mar-Med Co.'),
('McGhan Medical'),
('medComp'),
('MedDev'),
('Medex'),
('MedGyn'),
('MediChoice'),
('Mediflex'),
('Medivators'),
('Medline'),
('MedOne'),
('Medtrina'),
('Mentor'),
('Mepilex'),
('Merz'),
('MicroAire'),
('Microline'),
('MicroMedics Inc'),
('Microsurgical Technology'),
('Microtek Medical'),
('Minerva'),
('MIRA'),
('Misonix'),
('Mitek'),
('Mizuho'),
('Morcher GmbH'),
('MSI'),
('MTF Biologics'),
('M�lnlycke Health Care'),
('Nashville Surgical Instruments'),
('Natus'),
('Navilyst'),
('Neomedic International'),
('NeoTract'),
('NeuroTherm'),
('NeuroVision'),
('NiTi Surgical Solutions'),
('NuVasive'),
('Oasis'),
('Olsen'),
('Omniguide'),
('Ophtec'),
('Orphila'),
('Osteotech'),
('Ovesco'),
('PALL'),
('Parcus Medical'),
('Parker Medical'),
('Penumbra Inc.'),
('Peters Surgical'),
('Pfizer'),
('PFM'),
('Philips'),
('Phycon'),
('Pioneer Surgical Technology'),
('PMT Corporation'),
('Porex'),
('Pressure Products'),
('Progressive Medical'),
('Proximate'),
('Reshape Medical'),
('Richard-Allan'),
('Richards'),
('S. Jackson Inc.'),
('Salient Surgical Technologies'),
('Salter Labs'),
('Sanofi'),
('Saphena Medical'),
('Scanlan'),
('Shippert Medical Technologies'),
('Smiths Medical'),
('Sorin Group'),
('Specialty Surgical'),
('Spectranetics'),
('St. Jude Medical'),
('Starsurgical, Inc'),
('Steris'),
('Summit Medical'),
('SunMed'),
('Supramid'),
('Surgical Innovations'),
('Surgical Specialties Corporation'),
('Surgiform'),
('Surgin'),
('Surgistar Inc'),
('SutureEase Inc'),
('Symmetry Surgical'),
('Synergetics'),
('Synovis'),
('Technomed'),
('TeDan Surgical'),
('Tenex Health'),
('Terumo'),
('THD'),
('Tornier'),
('Trice'),
('TSI'),
('Unico'),
('UreSil'),
('UroCure'),
('Uromedica'),
('US Endoscopy'),
('Utah Medical'),
('V Mueller'),
('Vein360'),
('Verathon'),
('Vertos Medical'),
('Vesocclude'),
('VitaliTec'),
('VNUS Medical Technologies, Inc.'),
('Volcano'),
('Weck'),
('Winco'),
('Wright'),
('Z Medica'),
('Zeiss'),
('ZipLine Medical')
on conflict(normalized_name) do nothing;

create or replace function public.search_inventory_v3(p_query text default '',p_category text default '',p_manufacturer text default '',
  p_states text[] default '{}'::text[],p_expiration_status text default '',p_sort text default 'newest',p_page integer default 1,p_page_size integer default 12,
  p_facility_id uuid default null,p_saved boolean default false,p_status text default '',p_seller_facility_id uuid default null,p_procedure_type text default '',p_product_kind text default '') returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_page is null or p_page_size is null or p_query is null or p_sort is null
    or p_page not between 1 and 100000 or p_page_size not between 1 and 48 or length(p_query)>200
    or p_sort not in ('newest','price_low','price_high') then
    raise exception 'Invalid search or pagination. Reset filters and retry.' using errcode='22023';
  end if;
  if p_states is null or cardinality(p_states)>50 or exists(select 1 from unnest(p_states) s where s is null or s not in ('AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')) or p_expiration_status is null or p_expiration_status not in ('','in_date','short_date','expired') then raise exception 'Choose valid states and expiration status.' using errcode='22023'; end if;
  if p_facility_id is not null and not public.inventory_can_view(p_facility_id) then
    raise exception 'Active owner or inventory editor membership required to view seller inventory.' using errcode='42501';
  end if;
  if p_saved and auth.uid() is null then raise exception 'Log in to view saved listings.' using errcode='42501'; end if;
  with filtered as (
    select v.* from public.marketplace_inventory v
    where v.deleted_at is null and (case when p_facility_id is not null then v.facility_id=p_facility_id and (p_status='' or v.status=p_status)
      else v.status='active' and public.facility_is_public(v.facility_id) end)
      and (p_seller_facility_id is null or v.facility_id=p_seller_facility_id)
      and (p_procedure_type='' or v.procedure_type=p_procedure_type)
      and (p_product_kind='' or v.inventory_kind=p_product_kind)
      and (p_category='' or v.category=p_category)
      and (p_manufacturer='' or v.manufacturer_id::text=p_manufacturer)
      and (cardinality(p_states)=0 or v.facility->>'state'=any(p_states))
      and (p_expiration_status='' or (p_expiration_status='expired' and v.expiration<current_date)
       or (p_expiration_status='short_date' and v.expiration>=current_date and v.expiration<=(current_date+interval '12 months')::date)
       or (p_expiration_status='in_date' and v.expiration>(current_date+interval '12 months')::date))
      and not exists(select 1 from regexp_split_to_table(lower(btrim(p_query)),'\s+') token
        where token<>'' and strpos(lower(v.name||' '||v.manufacturer||' '||v.catalog_number||' '||v.description),token)=0)
      and (not p_saved or public.is_listing_saved(v.id))
  ), paged as (
    select * from filtered order by
      case when p_sort='price_low' then price_usd end asc,
      case when p_sort='price_high' then price_usd end desc,created_at desc,id
    limit p_page_size offset ((p_page::bigint-1)*p_page_size)
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged) order by
      case when p_sort='price_low' then price_usd end asc,
      case when p_sort='price_high' then price_usd end desc,created_at desc,id) from paged),'[]'::jsonb),
    'total',(select count(*) from filtered),'page',p_page,'page_size',p_page_size) into result;
  return result;
end;
$$;
revoke all on function public.search_inventory_v3(text,text,text,text[],text,text,integer,integer,uuid,boolean,text,uuid,text,text) from public;
grant execute on function public.search_inventory_v3(text,text,text,text[],text,text,integer,integer,uuid,boolean,text,uuid,text,text) to anon,authenticated;

-- Self-declarations are private snapshots, never proof of a role or approval.
create table private.registration_declarations (
 user_id uuid primary key references auth.users(id) on delete cascade,
 facility_npi text not null check(facility_npi ~ '^[0-9]{10}$'),
 terms_version text not null,accepted_at timestamptz not null default clock_timestamp()
);
alter table private.registration_declarations enable row level security;
revoke all on private.registration_declarations from public,anon,authenticated;
create function private.capture_registration_declaration() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.raw_user_meta_data->>'facility_npi' ~ '^[0-9]{10}$'
 and new.raw_user_meta_data->>'authorized_facility'='true' and new.raw_user_meta_data->>'terms_accepted'='true'
 and new.raw_user_meta_data->>'terms_version'='placeholder-2026-11-04' then
  insert into private.registration_declarations(user_id,facility_npi,terms_version)
  values(new.id,new.raw_user_meta_data->>'facility_npi','placeholder-2026-11-04');
 end if;
 return new;
end;$$;
revoke all on function private.capture_registration_declaration() from public,anon,authenticated;
create trigger capture_registration_declaration after insert on auth.users for each row execute function private.capture_registration_declaration();
create function public.my_registration_declaration() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_enabled_account();
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 return (select jsonb_build_object('facility_npi',facility_npi,'terms_version',terms_version,'accepted_at',accepted_at) from private.registration_declarations where user_id=auth.uid());
end;$$;
revoke all on function public.my_registration_declaration() from public,anon;
grant execute on function public.my_registration_declaration() to authenticated;

alter table public.facilities add column facility_npi text check(facility_npi ~ '^[0-9]{10}$'),
 add column registration_certified_by uuid references auth.users(id),add column registration_terms_version text,
 add column registration_accepted_at timestamptz;
-- Older records remain intact. Block ordinary legacy RPCs from bypassing the new
-- facility-specific requirements; the new guarded wrapper calls them internally.
revoke execute on function public.onboard_facility(text,text,text,text,uuid),public.onboard_facility_with_contacts(text,text,text,text,uuid,jsonb) from public,anon,authenticated;
create function public.onboard_facility_with_registration(p_name text,p_city text,p_state text,p_facility_type text,p_request_id uuid,p_contact jsonb,p_registration jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare fid uuid;existing public.facilities;
begin
 perform private.require_enabled_account();
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirm your account before onboarding.' using errcode='42501';end if;
 if p_request_id is null or p_registration is null or jsonb_typeof(p_registration)<>'object'
 or coalesce(p_registration->>'facility_npi','') !~ '^[0-9]{10}$'
 or p_registration->'authorized_facility' is distinct from 'true'::jsonb
 or p_registration->'terms_accepted' is distinct from 'true'::jsonb
 or p_registration->>'terms_version' is distinct from 'placeholder-2026-11-04' then
  raise exception 'Provide a 10-digit facility NPI, certify your authority and accept the current terms.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into existing from public.facilities where onboarding_request_id=p_request_id;
 if found then
  if existing.owner_user_id<>auth.uid() then raise exception 'Onboarding request unavailable.' using errcode='42501';end if;
  if existing.facility_npi is distinct from p_registration->>'facility_npi' or existing.registration_terms_version is distinct from p_registration->>'terms_version' then raise exception 'This registration changed. Start a new submission.' using errcode='22023';end if;
  return existing.id;
 end if;
 fid:=public.onboard_facility_with_contacts(p_name,p_city,p_state,p_facility_type,p_request_id,p_contact);
 update public.facilities set facility_npi=p_registration->>'facility_npi',registration_certified_by=auth.uid(),registration_terms_version='placeholder-2026-11-04',registration_accepted_at=clock_timestamp() where id=fid;
 return fid;
end;$$;
revoke all on function public.onboard_facility_with_registration(text,text,text,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.onboard_facility_with_registration(text,text,text,text,uuid,jsonb,jsonb) to authenticated;

-- Reuse the bounded, idempotent email worker. Only reviewed status transitions
-- enqueue approval email, never email confirmation or a repeated approval click.
alter table private.email_jobs drop constraint email_jobs_kind_check;
alter table private.email_jobs add constraint email_jobs_kind_check check(kind in ('watchlist','referral','facility_approved')),
 add column approval_audit_id uuid unique references private.facility_approval_audit(id),
 add column facility_id uuid references public.facilities(id);
create function private.queue_facility_approval_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;destination text;facility_name text;
begin
 if new.new_status<>new.previous_status then update private.email_jobs set state='cancelled' where facility_id=new.facility_id and kind='facility_approved' and state='pending';end if;
 if new.new_status<>'approved' or new.previous_status='approved' then return new;end if;
 select f.owner_user_id,to_jsonb(u)->>'email',f.name into owner_id,destination,facility_name from public.facilities f join auth.users u on u.id=f.owner_user_id
 where f.id=new.facility_id and u.email_confirmed_at is not null;
 if destination is not null then
  insert into private.email_jobs(kind,user_id,recipient,approval_audit_id,facility_id,payload)
   values('facility_approved',owner_id,destination,new.id,new.facility_id,jsonb_build_object('facility',facility_name)) on conflict(approval_audit_id) do nothing;
 end if;
 return new;
end;$$;
revoke all on function private.queue_facility_approval_email() from public,anon,authenticated;
create trigger queue_facility_approval_email after insert on private.facility_approval_audit for each row execute function private.queue_facility_approval_email();

create function public.claim_email_jobs_v2(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.email_jobs;items jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid batch size.' using errcode='22023'; end if;
 for job in select * from private.email_jobs where state='pending' or (state='sending' and claimed_at<clock_timestamp()-interval '10 minutes') order by created_at for update skip locked limit p_limit loop
  if job.attempts>=5 or job.created_at<clock_timestamp()-interval '23 hours' then update private.email_jobs set state='failed' where id=job.id;continue;end if;
  if not exists(select 1 from auth.users account where account.id=job.user_id and email_confirmed_at is not null and to_jsonb(account)->>'deleted_at' is null and coalesce((to_jsonb(account)->>'banned_until')::timestamptz,'-infinity')<=now() and not exists(select 1 from private.account_controls c where c.user_id=job.user_id and (c.disabled or c.removal_requested_at is not null or c.removed_at is not null)))
  or (job.kind='watchlist' and not exists(select 1 from public.watchlists w join public.listings l on l.id=job.listing_id join auth.users u on u.id=w.user_id
   where w.id=job.watchlist_id and w.enabled and w.email_enabled and u.email=job.recipient and l.status='active' and l.deleted_at is null and public.facility_is_public(l.facility_id)))
  or (job.kind='facility_approved' and not exists(select 1 from public.facilities f join auth.users u on u.id=f.owner_user_id join private.facility_approval_audit a on a.id=job.approval_audit_id where f.id=job.facility_id and f.status='approved' and f.owner_user_id=job.user_id and u.email=job.recipient and a.facility_id=f.id and a.new_status='approved' and exists(select 1 from public.facility_memberships m where m.facility_id=f.id and m.user_id=job.user_id and m.status='active' and m.role='owner')))
  or (job.kind='referral' and not exists(select 1 from public.facility_referrals r join public.facilities f on f.id=r.facility_id where r.id=job.referral_id and f.status='approved' and exists(select 1 from public.facility_memberships m where m.facility_id=f.id and m.user_id=job.user_id and m.status='active' and (m.role in ('administrator','inventory_editor') or (m.role='owner' and f.owner_user_id=job.user_id))))) then
   update private.email_jobs set state='cancelled' where id=job.id;continue;
  end if;
  update private.email_jobs set state='sending',claimed_at=clock_timestamp(),claim_token=gen_random_uuid(),attempts=attempts+1 where id=job.id returning * into job;
  items:=items||jsonb_build_array(jsonb_build_object('id',job.id,'kind',job.kind,'recipient',job.recipient,'listing_id',job.listing_id,'payload',job.payload,'claim_token',job.claim_token));
 end loop;
 return items;
end;$$;


revoke all on function public.claim_email_jobs_v2(integer) from public,anon,authenticated;
grant execute on function public.claim_email_jobs_v2(integer) to service_role;

-- The older worker keeps delivering its known job types during rollout.
create or replace function public.claim_email_jobs(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.email_jobs;items jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid batch size.' using errcode='22023'; end if;
 for job in select * from private.email_jobs where kind in ('watchlist','referral') and (state='pending' or (state='sending' and claimed_at<clock_timestamp()-interval '10 minutes')) order by created_at for update skip locked limit p_limit loop
  if job.attempts>=5 or job.created_at<clock_timestamp()-interval '23 hours' then update private.email_jobs set state='failed' where id=job.id;continue;end if;
  if not exists(select 1 from auth.users account where account.id=job.user_id and email_confirmed_at is not null and to_jsonb(account)->>'deleted_at' is null and coalesce((to_jsonb(account)->>'banned_until')::timestamptz,'-infinity')<=now() and not exists(select 1 from private.account_controls c where c.user_id=job.user_id and (c.disabled or c.removal_requested_at is not null or c.removed_at is not null)))
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


commit;
