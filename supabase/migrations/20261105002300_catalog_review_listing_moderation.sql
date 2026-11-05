begin;
-- Canonical products remain shared reference data. Deletion withdraws a product
-- from future selections while preserving IDs used by stock and conversations.
alter table public.products add column revision integer not null default 1,
 add column updated_at timestamptz not null default clock_timestamp(),add column archived_at timestamptz;
create function private.product_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision:=old.revision+1;new.updated_at:=clock_timestamp();return new;end;$$;
revoke all on function private.product_revision() from public,anon,authenticated;
create trigger product_revision before update on public.products for each row execute function private.product_revision();

create table private.catalog_admin_audit (
 id uuid primary key,actor_id uuid not null references auth.users,product_id uuid not null references public.products,
 action text not null check(action in ('update','archive','restore')),reason text not null,
 request jsonb not null,before_data jsonb not null,after_data jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table private.catalog_admin_audit enable row level security;
revoke all on private.catalog_admin_audit from public,anon,authenticated;

create function public.admin_catalog_directory(p_query text default '',p_page integer default 1,p_archived boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_account_administrator();
 if p_page is null or p_page not between 1 and 100000 or p_archived is null or length(coalesce(p_query,''))>200 then raise exception 'Invalid catalog search.' using errcode='22023';end if;
 return (with filtered as (
  select p.*,m.name as manufacturer,(select count(*) from public.listings l where l.product_id=p.id) as listing_count
  from public.products p join public.manufacturers m on m.id=p.manufacturer_id
  where (p.archived_at is not null)=p_archived and (coalesce(p_query,'')='' or strpos(lower(p.name||' '||p.catalog_number||' '||m.name||' '||p.category),lower(btrim(p_query)))>0)
 ),page as(select * from filtered order by name,id limit 20 offset (p_page-1)*20)
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(page) order by name,id) from page),'[]'::jsonb)));
end;$$;
revoke all on function public.admin_catalog_directory(text,integer,boolean) from public,anon;
grant execute on function public.admin_catalog_directory(text,integer,boolean) to authenticated;

create function public.admin_manage_catalog_product(p_request_id uuid,p_id uuid,p_revision integer,p_action text,p_product jsonb,p_reason text,p_confirm boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.products;before_item jsonb;receipt private.catalog_admin_audit;body jsonb;mid uuid;
begin
 perform private.require_account_administrator();
 p_reason:=btrim(coalesce(p_reason,''));
 if p_request_id is null or p_id is null or p_revision is null or p_action is null or p_action not in ('update','archive','restore')
 or length(p_reason) not between 10 and 1000 or p_confirm is distinct from true or p_product is null or jsonb_typeof(p_product)<>'object' then raise exception 'Review the product, confirm the action and provide a reason of 10-1000 characters.' using errcode='22023';end if;
 body:=jsonb_build_object('id',p_id,'revision',p_revision,'action',p_action,'product',p_product,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended('catalog-action:'||p_request_id::text,0));
 perform private.require_account_administrator();
 select * into receipt from private.catalog_admin_audit where id=p_request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.request<>body then raise exception 'Submission changed. Reload before retrying.' using errcode='42501';end if;
  return receipt.after_data;
 end if;
 select * into item from public.products where id=p_id for update;
 perform private.require_account_administrator();
 if item.id is null or item.revision is distinct from p_revision then raise exception 'This product changed. Refresh before saving.' using errcode='22023';end if;
 before_item:=to_jsonb(item);
 if p_action='update' then
  if item.archived_at is not null then raise exception 'Restore this product before editing it.' using errcode='22023';end if;
  if length(btrim(coalesce(p_product->>'name',''))) not between 2 and 180
  or length(btrim(coalesce(p_product->>'catalog_number',''))) not between 1 and 100
  or length(btrim(coalesce(p_product->>'category',''))) not between 2 and 100
  or length(coalesce(p_product->>'description',''))>4000 or length(coalesce(p_product->>'gtin',''))>64
  or coalesce(p_product->>'product_kind','') not in ('','capital','disposable') then raise exception 'Complete the product fields within the displayed limits.' using errcode='22023';end if;
  begin mid:=(p_product->>'manufacturer_id')::uuid;exception when invalid_text_representation then raise exception 'Choose an existing manufacturer.' using errcode='22023';end;
  if mid is null or not exists(select 1 from public.manufacturers where id=mid) then raise exception 'Choose an existing manufacturer.' using errcode='22023';end if;
  if exists(select 1 from public.products where id<>p_id and manufacturer_id=mid and normalized_catalog_number=public.normalize_identity(p_product->>'catalog_number')) then raise exception 'Another product already has this manufacturer and catalog/SKU identity. Edit that record instead.' using errcode='22023';end if;
  update public.products set manufacturer_id=mid,catalog_number=btrim(p_product->>'catalog_number'),name=btrim(p_product->>'name'),category=btrim(p_product->>'category'),description=coalesce(p_product->>'description',''),product_kind=nullif(p_product->>'product_kind',''),gtin=nullif(btrim(p_product->>'gtin'),'') where id=p_id returning * into item;
 elsif p_action='archive' then
  if item.archived_at is not null then raise exception 'This product is already deleted from the catalog.' using errcode='22023';end if;
  update public.products set archived_at=clock_timestamp() where id=p_id returning * into item;
 else
  if item.archived_at is null then raise exception 'This product is already available.' using errcode='22023';end if;
  update public.products set archived_at=null where id=p_id returning * into item;
 end if;
 insert into private.catalog_admin_audit(id,actor_id,product_id,action,reason,request,before_data,after_data)
 values(p_request_id,auth.uid(),p_id,p_action,p_reason,body,before_item,to_jsonb(item));
 return to_jsonb(item);
exception when unique_violation then raise exception 'This catalog identity already exists. Refresh before retrying.' using errcode='22023';
end;$$;
revoke all on function public.admin_manage_catalog_product(uuid,uuid,integer,text,jsonb,text,boolean) from public,anon;
grant execute on function public.admin_manage_catalog_product(uuid,uuid,integer,text,jsonb,text,boolean) to authenticated;

-- Track real authors for future listings and recover only known draft authors.
alter table public.listings add column created_by uuid references auth.users,
 add column moderation_rejected boolean not null default false;
update public.listings l set created_by=r.user_id from
 (select distinct on(listing_id) listing_id,user_id from private.listing_draft_requests order by listing_id,created_at,request_id) r where l.id=r.listing_id;
create function private.guard_catalog_listing() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then new.created_by:=auth.uid();new.moderation_rejected:=false;
 elsif new.created_by is distinct from old.created_by then raise exception 'Listing authorship cannot be changed.' using errcode='42501';end if;
 if new.moderation_rejected and new.status='active' then raise exception 'This listing was rejected. A platform administrator must clear the rejection before it can be republished.' using errcode='42501';end if;
 if tg_op='INSERT' or (old.status='draft' and new.status='active') then
  perform 1 from public.products where id=new.product_id and archived_at is null for share;
  if not found then raise exception 'This product was deleted from the catalog. Choose an available product or contact support.' using errcode='22023';end if;
 end if;
 return new;
end;$$;
revoke all on function private.guard_catalog_listing() from public,anon,authenticated;
create trigger guard_catalog_listing before insert or update on public.listings for each row execute function private.guard_catalog_listing();
create function private.guard_catalog_draft() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.product_id is distinct from old.product_id then
  perform 1 from public.products where id=new.product_id and archived_at is null for share;
  if not found then raise exception 'Choose an available catalog product.' using errcode='22023';end if;
 end if;
 return new;
end;$$;
revoke all on function private.guard_catalog_draft() from public,anon,authenticated;
create trigger guard_catalog_draft before insert or update on public.listing_wizard_drafts for each row execute function private.guard_catalog_draft();
create function private.guard_catalog_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='approved' and exists(select 1 from public.products where id=new.product_id and archived_at is not null) then raise exception 'This catalog identity was deleted. Restore it in Product Review before approving this submission.' using errcode='22023';end if;
 return new;
end;$$;
revoke all on function private.guard_catalog_approval() from public,anon,authenticated;
create trigger guard_catalog_approval before update on public.product_submissions for each row execute function private.guard_catalog_approval();

create table private.listing_moderation_audit (
 id uuid primary key,actor_id uuid not null references auth.users,listing_id uuid not null references public.listings,
 facility_id uuid not null references public.facilities,decision text not null check(decision in ('reject','release')),
 reason text not null check(length(reason) between 10 and 1000),request jsonb not null,
 before_revision integer not null,after_revision integer not null,created_at timestamptz not null default clock_timestamp()
);
alter table private.listing_moderation_audit enable row level security;
revoke all on private.listing_moderation_audit from public,anon,authenticated;
create table public.facility_listing_alerts (
 id uuid primary key references private.listing_moderation_audit,listing_id uuid not null references public.listings,
 facility_id uuid not null references public.facilities,product_name text not null,catalog_number text not null,
 reason text not null,created_at timestamptz not null default clock_timestamp(),cleared_at timestamptz
);
alter table public.facility_listing_alerts enable row level security;
revoke all on public.facility_listing_alerts from public,anon,authenticated;
grant select on public.facility_listing_alerts to authenticated;
create policy facility_listing_alerts_read on public.facility_listing_alerts for select to authenticated using(public.inventory_can_view(facility_id));
create index facility_listing_alerts_current on public.facility_listing_alerts(facility_id,created_at desc) where cleared_at is null;

alter table private.email_jobs drop constraint email_jobs_kind_check;
alter table private.email_jobs add constraint email_jobs_kind_check check(kind in ('watchlist','referral','facility_approved','listing_rejected')),
 add column listing_moderation_id uuid unique references private.listing_moderation_audit;

create function public.admin_marketplace_directory(p_query text default '',p_facility_query text default '',p_page integer default 1,p_rejected boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_account_administrator();
 if p_page is null or p_page not between 1 and 100000 or p_rejected is null or length(coalesce(p_query,''))>200 or length(coalesce(p_facility_query,''))>160 then raise exception 'Invalid marketplace search.' using errcode='22023';end if;
 return (with filtered as (
  select l.id,l.facility_id,l.revision,l.status,l.moderation_rejected,l.deleted_at,case when p_rejected then null::integer else l.quantity end as quantity,case when p_rejected then null::text else l.quantity_unit end as quantity_unit,case when p_rejected then null::numeric else l.price_usd end as price_usd,l.created_at,
  p.name,p.catalog_number,m.name as manufacturer,f.name as facility_name,f.state as facility_state,
  (select a.reason from public.facility_listing_alerts a where a.listing_id=l.id and a.cleared_at is null order by a.created_at desc,a.id limit 1) as rejection_reason
  from public.listings l join public.products p on p.id=l.product_id join public.manufacturers m on m.id=p.manufacturer_id join public.facilities f on f.id=l.facility_id
  where (case when p_rejected then l.moderation_rejected else l.status='active' and l.deleted_at is null and f.status='approved' and not l.moderation_rejected end)
  and (coalesce(p_query,'')='' or strpos(lower(p.name||' '||p.catalog_number||' '||m.name),lower(btrim(p_query)))>0)
  and (coalesce(p_facility_query,'')='' or strpos(lower(f.name),lower(btrim(p_facility_query)))>0)
 ),page as(select * from filtered order by created_at desc,id limit 20 offset (p_page-1)*20)
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]'::jsonb)));
end;$$;
revoke all on function public.admin_marketplace_directory(text,text,integer,boolean) from public,anon;
grant execute on function public.admin_marketplace_directory(text,text,integer,boolean) to authenticated;

create function public.admin_moderate_listing(p_request_id uuid,p_id uuid,p_revision integer,p_decision text,p_reason text,p_confirm boolean) returns void
language plpgsql security definer set search_path='' as $$
declare item public.listings;receipt private.listing_moderation_audit;body jsonb;product public.products;recipient_id uuid;destination text;before_revision integer;
begin
 perform private.require_account_administrator();p_reason:=btrim(coalesce(p_reason,''));
 if p_request_id is null or p_id is null or p_revision is null or p_decision is null or p_decision not in ('reject','release') or length(p_reason) not between 10 and 1000 or p_confirm is distinct from true then raise exception 'Confirm the listing decision and provide a reason of 10-1000 characters.' using errcode='22023';end if;
 body:=jsonb_build_object('id',p_id,'revision',p_revision,'decision',p_decision,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended('listing-review:'||p_request_id::text,0));perform private.require_account_administrator();
 select * into receipt from private.listing_moderation_audit where id=p_request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.request<>body then raise exception 'Submission changed. Reload before retrying.' using errcode='42501';end if;
  return;
 end if;
 select * into item from public.listings where id=p_id for update;perform private.require_account_administrator();
 if item.id is null or item.revision is distinct from p_revision then raise exception 'This listing changed. Refresh before reviewing it.' using errcode='22023';end if;
 before_revision:=item.revision;
 if p_decision='reject' then
  if item.status<>'active' or item.deleted_at is not null or item.moderation_rejected or not public.facility_is_public(item.facility_id) then raise exception 'Only a current public marketplace listing can be rejected.' using errcode='22023';end if;
  update public.listings set status='inactive',moderation_rejected=true,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into item;
 else
  if not item.moderation_rejected then raise exception 'This listing has no active rejection.' using errcode='22023';end if;
  -- Clearing a rejection never republishes inventory or overrides facility status.
  update public.listings set moderation_rejected=false,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into item;
 end if;
 insert into private.listing_moderation_audit(id,actor_id,listing_id,facility_id,decision,reason,request,before_revision,after_revision)
 values(p_request_id,auth.uid(),p_id,item.facility_id,p_decision,p_reason,body,before_revision,item.revision);
 if p_decision='release' then
  update public.facility_listing_alerts set cleared_at=clock_timestamp() where listing_id=p_id and cleared_at is null;
  update private.email_jobs set state='cancelled' where listing_id=p_id and kind='listing_rejected' and state='pending';
 else
  select * into product from public.products where id=item.product_id;
  insert into public.facility_listing_alerts(id,listing_id,facility_id,product_name,catalog_number,reason) values(p_request_id,p_id,item.facility_id,product.name,product.catalog_number,p_reason);
  -- Prefer a known, still-eligible lister; old stock without author evidence uses
  -- the verified facility owner. Never trust a caller-supplied destination.
  select u.id,to_jsonb(u)->>'email' into recipient_id,destination from auth.users u join public.facility_memberships m on m.user_id=u.id and m.facility_id=item.facility_id join public.facilities f on f.id=m.facility_id
  where (u.id=item.created_by or u.id=f.owner_user_id) and u.email_confirmed_at is not null and to_jsonb(u)->>'email' is not null
  and to_jsonb(u)->>'deleted_at' is null and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()
  and not exists(select 1 from private.account_controls c where c.user_id=u.id and (c.disabled or c.removal_requested_at is not null or c.removed_at is not null))
  and m.status='active' and (m.role='inventory_editor' or (m.role='owner' and f.owner_user_id=u.id))
  order by (u.id=item.created_by) desc nulls last,u.id limit 1;
  if destination is not null then
   insert into private.email_jobs(kind,user_id,recipient,listing_id,facility_id,listing_moderation_id,payload)
   values('listing_rejected',recipient_id,destination,p_id,item.facility_id,p_request_id,jsonb_build_object('product',product.name,'catalog',product.catalog_number,'reason',p_reason,'facility',(select name from public.facilities where id=item.facility_id))) on conflict(listing_moderation_id) do nothing;
  end if;
 end if;
end;$$;
revoke all on function public.admin_moderate_listing(uuid,uuid,integer,text,text,boolean) from public,anon;
grant execute on function public.admin_moderate_listing(uuid,uuid,integer,text,text,boolean) to authenticated;

-- Versioned claims keep older deployed workers from consuming an unknown mail type.
create function public.claim_email_jobs_v3(p_limit integer default 20) returns jsonb
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
  or (job.kind='listing_rejected' and not exists(select 1 from public.listings l join public.facility_listing_alerts a on a.listing_id=l.id and a.id=job.listing_moderation_id join auth.users u on u.id=job.user_id join public.facility_memberships m on m.user_id=u.id and m.facility_id=l.facility_id join public.facilities f on f.id=m.facility_id where l.id=job.listing_id and l.facility_id=job.facility_id and l.moderation_rejected and l.deleted_at is null and a.cleared_at is null and u.email=job.recipient and m.status='active' and (m.role='inventory_editor' or (m.role='owner' and f.owner_user_id=u.id))))
  or (job.kind='referral' and not exists(select 1 from public.facility_referrals r join public.facilities f on f.id=r.facility_id where r.id=job.referral_id and f.status='approved' and exists(select 1 from public.facility_memberships m where m.facility_id=f.id and m.user_id=job.user_id and m.status='active' and (m.role in ('administrator','inventory_editor') or (m.role='owner' and f.owner_user_id=job.user_id))))) then
   update private.email_jobs set state='cancelled' where id=job.id;continue;
  end if;
  update private.email_jobs set state='sending',claimed_at=clock_timestamp(),claim_token=gen_random_uuid(),attempts=attempts+1 where id=job.id returning * into job;
  items:=items||jsonb_build_array(jsonb_build_object('id',job.id,'kind',job.kind,'recipient',job.recipient,'listing_id',job.listing_id,'payload',job.payload,'claim_token',job.claim_token));
 end loop;
 return items;
end;$$;



revoke all on function public.claim_email_jobs_v3(integer) from public,anon,authenticated;
grant execute on function public.claim_email_jobs_v3(integer) to service_role;

create or replace function public.claim_email_jobs_v2(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.email_jobs;items jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid batch size.' using errcode='22023'; end if;
 for job in select * from private.email_jobs where kind in ('watchlist','referral','facility_approved') and (state='pending' or (state='sending' and claimed_at<clock_timestamp()-interval '10 minutes')) order by created_at for update skip locked limit p_limit loop
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



commit;
