begin;
-- Offers coordinate facility exchanges; no payments, addresses or carrier API credentials.
create table public.purchase_offers (
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.conversations,
 created_by uuid not null references auth.users,countered_by uuid references auth.users,
 quantity integer not null check(quantity between 1 and 1000000000),quantity_unit text not null,
 units_per_package integer not null,unit_price numeric(12,2) not null check(unit_price between 0 and 9999999999.99),
 listed_unit_price numeric(12,2) not null,
 status text not null default 'requested' check(status in ('requested','countered','accepted','denied','counter_declined','withdrawn','shipped')),
 revision integer not null default 1,carrier text check(carrier in ('FedEx','UPS')),
 tracking_number text not null default '' check(length(tracking_number)<=100),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create unique index one_open_purchase_offer on public.purchase_offers(conversation_id) where status in ('requested','countered','accepted');
create index purchase_offers_updated on public.purchase_offers(updated_at desc,id);
alter table public.purchase_offers enable row level security;
create policy purchase_offers_read on public.purchase_offers for select to authenticated using(public.conversation_access(conversation_id));
revoke all on public.purchase_offers from public,anon,authenticated;
grant select on public.purchase_offers to authenticated;
create table public.purchase_offer_events (
 id uuid primary key default gen_random_uuid(),offer_id uuid not null references public.purchase_offers,
 conversation_id uuid not null references public.conversations,message_id uuid not null unique references public.conversation_messages,
 action text not null,offer_revision integer not null,quantity integer not null,unit_price numeric(12,2) not null,
 created_at timestamptz not null default clock_timestamp(),unique(offer_id,offer_revision)
);
alter table public.purchase_offer_events enable row level security;
create policy purchase_offer_events_read on public.purchase_offer_events for select to authenticated using(public.conversation_access(conversation_id));
revoke all on public.purchase_offer_events from public,anon,authenticated;
grant select on public.purchase_offer_events to authenticated;
create table private.purchase_offer_requests (
 actor_id uuid not null references auth.users,request_id uuid not null,offer_id uuid not null references public.purchase_offers,
 payload jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_id)
);
alter table private.purchase_offer_requests enable row level security;
revoke all on private.purchase_offer_requests from public,anon,authenticated;

create function private.offer_member_live(p_user uuid,p_facility uuid,p_inventory boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.facility_memberships m on m.user_id=u.id join public.facilities f on f.id=m.facility_id
 where u.id=p_user and u.email_confirmed_at is not null and to_jsonb(u)->>'deleted_at' is null
 and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()
 and not exists(select 1 from private.account_controls a where a.user_id=u.id and (a.disabled or a.removal_requested_at is not null or a.removed_at is not null))
 and m.facility_id=p_facility and m.status='active' and f.status='approved'
 and (m.role='inventory_editor' or (m.role='owner' and f.owner_user_id=u.id) or (not p_inventory and m.role='administrator')));
$$;
revoke all on function private.offer_member_live(uuid,uuid,boolean) from public,anon,authenticated;
create function private.require_offer_facility(p_facility uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_enabled_account();
 perform private.require_conversation_member(p_facility);
 if not exists(select 1 from public.profiles where id=auth.uid() and active_facility_id=p_facility) then raise exception 'Your active facility changed. Select the participant facility and refresh.' using errcode='42501';end if;
end;$$;
revoke all on function private.require_offer_facility(uuid) from public,anon,authenticated;
create function private.log_purchase_offer(p_offer public.purchase_offers,p_facility uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare body text;mid uuid;
begin
 body:=case p_action when 'request' then 'Purchase offer sent' when 'counter' then 'Seller counteroffer sent' when 'accept' then 'Purchase offer accepted; quantity allocated. Seller to arrange shipping' when 'deny' then 'Purchase offer denied' when 'decline' then 'Buyer declined the counteroffer; this offer is closed' when 'withdraw' then 'Buyer withdrew the purchase offer' when 'ship' then 'Seller confirmed shipment' end;
 body:=body||': '||p_offer.quantity||' '||p_offer.quantity_unit||' at USD '||p_offer.unit_price||' per '||p_offer.quantity_unit||' (USD '||(p_offer.quantity*p_offer.unit_price)||' total).';
 if p_action='ship' then body:=body||' Carrier: '||p_offer.carrier||case when p_offer.tracking_number<>'' then '. Tracking: '||p_offer.tracking_number else '. No tracking number supplied' end||'.';end if;
 body:=body||' Payment and shipping costs are arranged directly between facilities; H2H does not collect payment.';
 mid:=private.send_conversation_message(p_offer.conversation_id,p_facility,body,gen_random_uuid());
 insert into public.purchase_offer_events(offer_id,conversation_id,message_id,action,offer_revision,quantity,unit_price)
 values(p_offer.id,p_offer.conversation_id,mid,p_action,p_offer.revision,p_offer.quantity,p_offer.unit_price);
end;$$;
revoke all on function private.log_purchase_offer(public.purchase_offers,uuid,text) from public,anon,authenticated;

create function public.send_purchase_offer(p_request_id uuid,p_conversation_id uuid,p_facility_id uuid,p_listing_revision integer,p_quantity integer,p_price_mode text,p_unit_price numeric default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.conversations;l public.listings;o public.purchase_offers;r private.purchase_offer_requests;payload jsonb;price numeric;
begin
 perform private.require_offer_facility(p_facility_id);
 if p_request_id is null or p_quantity is null or p_quantity not between 1 and 1000000000 or p_price_mode is null or p_price_mode not in ('list','custom')
 or (p_price_mode='list' and p_unit_price is not null) or (p_price_mode='custom' and (p_unit_price is null or p_unit_price<0 or p_unit_price>9999999999.99 or p_unit_price<>round(p_unit_price,2))) then raise exception 'Choose a quantity and a valid USD unit price.' using errcode='22023';end if;
 select * into c from public.conversations where id=p_conversation_id;
 if c.id is null or p_facility_id<>c.buyer_facility_id or not public.conversation_access(c.id) then raise exception 'Only the eligible buying facility can send a purchase offer.' using errcode='42501';end if;
 payload:=jsonb_build_object('action','request','conversation',p_conversation_id,'facility',p_facility_id,'listing_revision',p_listing_revision,'quantity',p_quantity,'mode',p_price_mode,'price',p_unit_price);
 perform pg_advisory_xact_lock(hashtextextended('h2h-offer-user:'||auth.uid()::text,0));
 select * into r from private.purchase_offer_requests where actor_id=auth.uid() and request_id=p_request_id;
 if found then if r.payload<>payload then raise exception 'Submission changed. Reload before trying again.' using errcode='22023';end if;return r.offer_id;end if;
 select * into l from public.listings where id=c.listing_id for update;
 perform private.require_offer_facility(p_facility_id);
 if not public.conversation_access(c.id) then raise exception 'Conversation access changed.' using errcode='42501';end if;
 if l.status<>'active' or l.deleted_at is not null or l.moderation_rejected or l.revision is distinct from p_listing_revision or p_quantity>l.quantity then raise exception 'Listing availability changed. Refresh and review the quantity and price.' using errcode='22023';end if;
 if exists(select 1 from public.purchase_offers where conversation_id=c.id and status in ('requested','countered','accepted')) then raise exception 'Finish or withdraw the current offer before starting another.' using errcode='22023';end if;
 price:=case when p_price_mode='list' then l.price_usd else p_unit_price end;
 insert into public.purchase_offers(conversation_id,created_by,quantity,quantity_unit,units_per_package,unit_price,listed_unit_price)
 values(c.id,auth.uid(),p_quantity,l.quantity_unit,l.units_per_package,price,l.price_usd) returning * into o;
 perform private.log_purchase_offer(o,p_facility_id,'request');
 insert into private.purchase_offer_requests(actor_id,request_id,offer_id,payload) values(auth.uid(),p_request_id,o.id,payload);
 return o.id;
end;$$;

create function public.act_purchase_offer(p_request_id uuid,p_offer_id uuid,p_facility_id uuid,p_revision integer,p_action text,p_unit_price numeric default null,p_carrier text default null,p_tracking text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.purchase_offers;c public.conversations;l public.listings;r private.purchase_offer_requests;payload jsonb;buyer boolean;
begin
 perform private.require_offer_facility(p_facility_id);
 if p_request_id is null or p_action is null or p_action not in ('accept','deny','counter','decline','withdraw','ship') or p_revision is null then raise exception 'Choose an offer action and refresh its revision.' using errcode='22023';end if;
 if (p_action='counter' and (p_unit_price is null or p_unit_price<0 or p_unit_price>9999999999.99 or p_unit_price<>round(p_unit_price,2))) or (p_action<>'counter' and p_unit_price is not null)
 or (p_action='ship' and (p_carrier is null or p_carrier not in ('FedEx','UPS') or length(coalesce(p_tracking,''))>100 or coalesce(p_tracking,'') ~ '[[:cntrl:]]'))
 or (p_action<>'ship' and (p_carrier is not null or coalesce(p_tracking,'')<>'')) then raise exception 'Review the counter price or shipping details.' using errcode='22023';end if;
 select * into o from public.purchase_offers where id=p_offer_id;
 select * into c from public.conversations where id=o.conversation_id;
 if o.id is null or not public.conversation_access(c.id) or p_facility_id not in (c.buyer_facility_id,c.seller_facility_id) then raise exception 'Offer unavailable to your facility.' using errcode='42501';end if;
 buyer:=p_facility_id=c.buyer_facility_id;
 if not buyer and not private.offer_member_live(auth.uid(),c.seller_facility_id,true) then raise exception 'An active seller owner or inventory editor must review offers and confirm shipping.' using errcode='42501';end if;
 payload:=jsonb_build_object('action',p_action,'offer',p_offer_id,'facility',p_facility_id,'revision',p_revision,'price',p_unit_price,'carrier',p_carrier,'tracking',coalesce(p_tracking,''));
 perform pg_advisory_xact_lock(hashtextextended('h2h-offer-user:'||auth.uid()::text,0));
 select * into r from private.purchase_offer_requests where actor_id=auth.uid() and request_id=p_request_id;
 if found then if r.payload<>payload then raise exception 'Submission changed. Reload before trying again.' using errcode='22023';end if;return r.offer_id;end if;
 -- Every offer on the same stock locks the listing first; cross-buyer acceptance cannot oversell.
 select * into l from public.listings where id=c.listing_id for update;
 select * into o from public.purchase_offers where id=p_offer_id for update;
 perform private.require_offer_facility(p_facility_id);
 if not public.conversation_access(c.id) or (not buyer and not private.offer_member_live(auth.uid(),c.seller_facility_id,true)) then raise exception 'Participant permissions changed.' using errcode='42501';end if;
 if o.revision<>p_revision then raise exception 'This offer changed. Refresh before responding.' using errcode='22023';end if;
 if not ((not buyer and o.status='requested' and p_action in ('accept','deny','counter'))
 or (buyer and o.status='countered' and p_action in ('accept','decline','withdraw'))
 or (buyer and o.status='requested' and p_action='withdraw')
 or (not buyer and o.status='accepted' and p_action='ship')) then raise exception 'This action is not available on the current offer.' using errcode='22023';end if;
 if p_action in ('accept','counter') then
  if l.status<>'active' or l.deleted_at is not null or l.moderation_rejected or o.quantity>l.quantity or o.quantity_unit<>l.quantity_unit or o.units_per_package<>l.units_per_package then raise exception 'Listing availability or packaging changed. Withdraw/deny this offer and start again.' using errcode='22023';end if;
  if p_action='accept' and o.listed_unit_price<>l.price_usd then raise exception 'The listing price changed. Review a new offer before accepting.' using errcode='22023';end if;
  if not private.offer_member_live(o.created_by,c.buyer_facility_id,false) then raise exception 'The original buyer no longer has access. Start a new offer.' using errcode='42501';end if;
  if buyer and not private.offer_member_live(o.countered_by,c.seller_facility_id,true) then raise exception 'The counteroffer author no longer has seller permission. Start a new offer.' using errcode='42501';end if;
 end if;
 if p_action='accept' then
  update public.listings set quantity=case when quantity=o.quantity then quantity else quantity-o.quantity end,
   status=case when quantity=o.quantity then 'sold' else 'active' end,revision=revision+1,updated_at=clock_timestamp() where id=l.id;
 end if;
 update public.purchase_offers set status=case p_action when 'counter' then 'countered' when 'accept' then 'accepted' when 'deny' then 'denied' when 'decline' then 'counter_declined' when 'withdraw' then 'withdrawn' when 'ship' then 'shipped' end,
  unit_price=case when p_action='counter' then p_unit_price else unit_price end,
  listed_unit_price=case when p_action='counter' then l.price_usd else listed_unit_price end,
  countered_by=case when p_action='counter' then auth.uid() else countered_by end,
  carrier=case when p_action='ship' then p_carrier else carrier end,tracking_number=case when p_action='ship' then coalesce(p_tracking,'') else tracking_number end,
  revision=revision+1,updated_at=clock_timestamp() where id=o.id returning * into o;
 perform private.log_purchase_offer(o,p_facility_id,p_action);
 insert into private.purchase_offer_requests(actor_id,request_id,offer_id,payload) values(auth.uid(),p_request_id,o.id,payload);
 return o.id;
end;$$;

create function public.conversation_offer_context(p_conversation_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_enabled_account();
 if not public.conversation_access(p_conversation_id) then raise exception 'Conversation unavailable.' using errcode='42501';end if;
 return jsonb_build_object('listing',(select jsonb_build_object('id',l.id,'revision',l.revision,'quantity',l.quantity,'quantity_unit',l.quantity_unit,'price_usd',l.price_usd,'units_per_package',l.units_per_package)
  from public.conversations c join public.listings l on l.id=c.listing_id where c.id=p_conversation_id and l.status='active' and l.deleted_at is null and not l.moderation_rejected),
  'offers',(select coalesce(jsonb_agg(to_jsonb(items) order by items.created_at desc,items.id),'[]'::jsonb) from
   (select * from public.purchase_offers where conversation_id=p_conversation_id order by created_at desc,id limit 20) items));
end;$$;

create function public.my_purchase_offers(p_page integer default 1,p_direction text default 'all',p_history boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_enabled_account();
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 100000 or p_direction is null or p_direction not in ('all','buying','selling') or p_history is null then raise exception 'Invalid offer filters.' using errcode='22023';end if;
 return (with items as (
  select o.*,c.listing_id,c.buyer_facility_id,c.seller_facility_id,p.name,p.catalog_number,bf.name as buyer_name,sf.name as seller_name,
   (case when o.status='countered' then c.buyer_facility_id else c.seller_facility_id end) as action_facility_id,
   case when o.status='countered' then public.conversation_member(c.buyer_facility_id)
    when o.status in ('requested','accepted') then private.offer_member_live(auth.uid(),c.seller_facility_id,true) else false end as needs_action
  from public.purchase_offers o join public.conversations c on c.id=o.conversation_id join public.listings l on l.id=c.listing_id join public.products p on p.id=l.product_id
  join public.facilities bf on bf.id=c.buyer_facility_id join public.facilities sf on sf.id=c.seller_facility_id
  where public.conversation_access(c.id) and (p_history or o.status in ('requested','countered','accepted'))
   and (p_direction='all' or (p_direction='buying' and public.conversation_member(c.buyer_facility_id)) or (p_direction='selling' and public.conversation_member(c.seller_facility_id)))
 ),paged as (select * from items order by updated_at desc,id limit 20 offset (p_page-1)*20)
 select jsonb_build_object('total',(select count(*) from items),'action_count',(select count(*) from items where needs_action),
 'items',coalesce((select jsonb_agg(to_jsonb(paged) order by updated_at desc,id) from paged),'[]'::jsonb)));
end;$$;
revoke all on function public.send_purchase_offer(uuid,uuid,uuid,integer,integer,text,numeric),public.act_purchase_offer(uuid,uuid,uuid,integer,text,numeric,text,text),public.conversation_offer_context(uuid),public.my_purchase_offers(integer,text,boolean) from public,anon;
grant execute on function public.send_purchase_offer(uuid,uuid,uuid,integer,integer,text,numeric),public.act_purchase_offer(uuid,uuid,uuid,integer,text,numeric,text,text),public.conversation_offer_context(uuid),public.my_purchase_offers(integer,text,boolean) to authenticated;
commit;
