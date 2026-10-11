-- Canonical reference catalog and facility inventory. No workbook stock is inferred.
begin;
create function public.normalize_identity(value text) returns text
language sql immutable strict set search_path = '' as $$
  select lower(regexp_replace(btrim(value), '\s+', ' ', 'g'));
$$;
create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  normalized_name text generated always as (public.normalize_identity(name)) stored unique
);
alter table public.manufacturers enable row level security;
create table public.products (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers,
  catalog_number text not null check (length(btrim(catalog_number)) between 1 and 100),
  normalized_catalog_number text generated always as (public.normalize_identity(catalog_number)) stored,
  name text not null check (length(btrim(name)) between 2 and 180),
  category text not null check (length(btrim(category)) between 2 and 100),
  description text not null default '' check (length(description) <= 4000),
  gtin text, reference_source text,
  created_at timestamptz not null default now(),
  unique (manufacturer_id, normalized_catalog_number)
);
alter table public.products enable row level security;
create index products_search on public.products using gin(to_tsvector('simple', name || ' ' || catalog_number || ' ' || description));
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities,
  product_id uuid not null references public.products,
  quantity integer not null check (quantity between 1 and 100000000),
  quantity_unit text not null check (quantity_unit in ('each','box','case','pack')),
  units_per_package integer not null check (units_per_package between 1 and 1000000),
  price_usd numeric(12,2) not null check (price_usd >= 0 and price_usd <= 9999999999.99),
  currency text not null default 'USD' check (currency = 'USD'),
  condition text not null check (condition in ('New / unopened','New / open packaging','Used — good','Used — fair')),
  expiration date,
  sterile boolean not null default false,
  single_use boolean not null default true,
  packaging text not null default '' check (length(packaging) <= 200),
  notes text not null default '' check (length(notes) <= 2000),
  status text not null default 'active' check (status in ('active','inactive','sold')),
  revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (quantity_unit <> 'each' or units_per_package = 1)
);
alter table public.listings enable row level security;
create index listings_public_search on public.listings(status,created_at desc,id);
create index listings_facility on public.listings(facility_id,status);
create table public.saved_listings (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  listing_id uuid not null references public.listings on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id,listing_id)
);
alter table public.saved_listings enable row level security;
-- Read helpers reveal capabilities, never account or membership records.
create function public.inventory_can_view(p_facility_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.facility_memberships m join public.facilities f on f.id=m.facility_id
    where m.facility_id=p_facility_id and m.user_id=auth.uid() and m.status='active'
    and (m.role='inventory_editor' or (m.role='owner' and f.owner_user_id=auth.uid())));
$$;
create or replace function public.facility_can_publish(p_facility_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.inventory_can_view(p_facility_id) and exists(select 1 from public.facilities where id=p_facility_id and status='approved');
$$;
create function public.facility_is_public(p_facility_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.facilities where id=p_facility_id and status='approved');
$$;
revoke all on function public.inventory_can_view(uuid), public.facility_is_public(uuid) from public;
grant execute on function public.inventory_can_view(uuid), public.facility_is_public(uuid) to anon,authenticated;
create policy manufacturers_read on public.manufacturers for select to anon,authenticated using(true);
create policy products_read on public.products for select to anon,authenticated using(true);
create policy listings_read on public.listings for select to anon,authenticated
  using ((status='active' and public.facility_is_public(facility_id)) or public.inventory_can_view(facility_id));
create policy saves_read on public.saved_listings for select to authenticated using(user_id=(select auth.uid()));
create policy saves_insert on public.saved_listings for insert to authenticated
  with check(user_id=(select auth.uid()) and exists(select 1 from public.listings l where l.id=listing_id and l.status='active' and public.facility_is_public(l.facility_id)));
create policy saves_delete on public.saved_listings for delete to authenticated using(user_id=(select auth.uid()));
revoke all on public.manufacturers,public.products,public.listings,public.saved_listings from public,anon,authenticated;
grant select on public.manufacturers,public.products,public.listings to anon,authenticated;
grant select,insert,delete on public.saved_listings to authenticated;
-- Lock live facility AND membership rows for the duration of each mutation.
create function private.require_inventory_manager(p_facility_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.facilities; m public.facility_memberships;
begin
  select * into f from public.facilities where id=p_facility_id for share;
  select * into m from public.facility_memberships where facility_id=p_facility_id and user_id=auth.uid() for share;
  if auth.uid() is null or f.status is distinct from 'approved' or m.status is distinct from 'active'
    or not (m.role='inventory_editor' or (m.role='owner' and f.owner_user_id=auth.uid())) then
    raise exception 'An approved facility and active owner or inventory editor membership are required.' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'Confirm your email before managing inventory.' using errcode='42501';
  end if;
end;
$$;
revoke all on function private.require_inventory_manager(uuid) from public,anon,authenticated;
-- Single guarded operation resolves a product and creates inventory atomically.
-- Existing canonical products are reused; supplied shared metadata never overwrites them.
create function public.create_inventory_listing(p_facility_id uuid, p_product jsonb, p_inventory jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare mid uuid; pid uuid; lid uuid;
begin
  perform private.require_inventory_manager(p_facility_id);
  if (p_inventory->>'price_usd')::numeric <> round((p_inventory->>'price_usd')::numeric,2) then
    raise exception 'USD prices must have at most two decimal places.' using errcode='22023';
  end if;
  if p_product->>'id' is not null then
    select id into pid from public.products where id=(p_product->>'id')::uuid;
    if pid is null then raise exception 'Select an existing product or propose a new reference.' using errcode='22023'; end if;
  else
    insert into public.manufacturers(name) values(btrim(p_product->>'manufacturer'))
      on conflict(normalized_name) do nothing;
    select id into mid from public.manufacturers where normalized_name=public.normalize_identity(p_product->>'manufacturer');
    insert into public.products(manufacturer_id,catalog_number,name,category,description)
      values(mid,btrim(p_product->>'catalog_number'),btrim(p_product->>'name'),btrim(p_product->>'category'),coalesce(p_product->>'description',''))
      on conflict(manufacturer_id,normalized_catalog_number) do nothing;
    select id into pid from public.products where manufacturer_id=mid and normalized_catalog_number=public.normalize_identity(p_product->>'catalog_number');
  end if;
  insert into public.listings(facility_id,product_id,quantity,quantity_unit,units_per_package,price_usd,condition,expiration,sterile,single_use,packaging,notes,status)
    values(p_facility_id,pid,(p_inventory->>'quantity')::integer,p_inventory->>'quantity_unit',
      (p_inventory->>'units_per_package')::integer,(p_inventory->>'price_usd')::numeric,p_inventory->>'condition',
      nullif(p_inventory->>'expiration','')::date,(p_inventory->>'sterile')::boolean,(p_inventory->>'single_use')::boolean,
      coalesce(p_inventory->>'packaging',''),coalesce(p_inventory->>'notes',''),coalesce(p_inventory->>'status','active')) returning id into lid;
  return lid;
end;
$$;
create function public.update_inventory_listing(p_listing_id uuid, p_revision integer, p_inventory jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.listings;
begin
  select * into l from public.listings where id=p_listing_id;
  perform private.require_inventory_manager(l.facility_id);
  select * into l from public.listings where id=p_listing_id for update;
  if l.revision is distinct from p_revision then raise exception 'This listing changed. Reload before saving.' using errcode='22023'; end if;
  if p_inventory ? 'facility_id' or p_inventory ? 'product_id' then
    raise exception 'Listing facility and product identity cannot be changed.' using errcode='42501';
  end if;
  if p_inventory ? 'price_usd' and (p_inventory->>'price_usd')::numeric <> round((p_inventory->>'price_usd')::numeric,2) then
    raise exception 'USD prices must have at most two decimal places.' using errcode='22023';
  end if;
  update public.listings set quantity=coalesce((p_inventory->>'quantity')::integer,l.quantity),
    quantity_unit=coalesce(p_inventory->>'quantity_unit',l.quantity_unit),
    units_per_package=coalesce((p_inventory->>'units_per_package')::integer,l.units_per_package),
    price_usd=coalesce((p_inventory->>'price_usd')::numeric,l.price_usd),
    condition=coalesce(p_inventory->>'condition',l.condition),
    expiration=case when p_inventory ? 'expiration' then nullif(p_inventory->>'expiration','')::date else l.expiration end,
    sterile=coalesce((p_inventory->>'sterile')::boolean,l.sterile),single_use=coalesce((p_inventory->>'single_use')::boolean,l.single_use),
    packaging=coalesce(p_inventory->>'packaging',l.packaging),notes=coalesce(p_inventory->>'notes',l.notes),
    status=coalesce(p_inventory->>'status',l.status),revision=l.revision+1,updated_at=now() where id=p_listing_id;
  return p_listing_id;
end;
$$;
revoke all on function public.create_inventory_listing(uuid,jsonb,jsonb),public.update_inventory_listing(uuid,integer,jsonb) from public,anon;
grant execute on function public.create_inventory_listing(uuid,jsonb,jsonb),public.update_inventory_listing(uuid,integer,jsonb) to authenticated;
commit;
