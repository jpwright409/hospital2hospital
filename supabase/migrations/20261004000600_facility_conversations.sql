begin;
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings,
  buyer_facility_id uuid not null references public.facilities,
  seller_facility_id uuid not null references public.facilities,
  last_sequence bigint not null default 0,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(buyer_facility_id<>seller_facility_id),unique(listing_id,buyer_facility_id)
);
alter table public.conversations enable row level security;
create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations,
  sequence bigint not null,
  author_user_id uuid not null references auth.users,
  author_facility_id uuid not null references public.facilities,
  author_label text not null,
  body text not null check(length(btrim(body)) between 1 and 4000),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(conversation_id,sequence),unique(author_user_id,request_id)
);
alter table public.conversation_messages enable row level security;
create index messages_actor_rate on public.conversation_messages(author_user_id,created_at);
create index messages_facility_rate on public.conversation_messages(author_facility_id,created_at);
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations,
  user_id uuid not null references auth.users,
  last_sequence bigint not null default 0,
  primary key(conversation_id,user_id)
);
alter table public.conversation_reads enable row level security;
create function public.conversation_member(p_facility_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.facility_memberships m join public.facilities f on f.id=m.facility_id
    join auth.users u on u.id=m.user_id where m.facility_id=p_facility_id and m.user_id=auth.uid() and m.status='active'
    and f.status='approved' and u.email_confirmed_at is not null
    and (m.role in ('administrator','inventory_editor') or (m.role='owner' and f.owner_user_id=auth.uid())));
$$;
create or replace function public.facility_can_inquire(p_facility_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.conversation_member(p_facility_id); $$;
create function public.conversation_access(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.conversations c where c.id=p_id
    and public.facility_is_public(c.buyer_facility_id) and public.facility_is_public(c.seller_facility_id)
    and (public.conversation_member(c.buyer_facility_id) or public.conversation_member(c.seller_facility_id)));
$$;
revoke all on function public.conversation_member(uuid),public.conversation_access(uuid) from public;
grant execute on function public.conversation_member(uuid),public.conversation_access(uuid) to authenticated;
create policy conversations_read on public.conversations for select to authenticated using(public.conversation_access(id));
create policy messages_read on public.conversation_messages for select to authenticated using(public.conversation_access(conversation_id));
create policy receipts_read on public.conversation_reads for select to authenticated using(user_id=auth.uid() and public.conversation_access(conversation_id));
revoke all on public.conversations,public.conversation_messages,public.conversation_reads from public,anon,authenticated;
grant select on public.conversations,public.conversation_messages,public.conversation_reads to authenticated;
-- No direct writes: immutable authorship, participants, text, and server sequences.
create function private.require_conversation_member(p_facility_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.facilities where id=p_facility_id for share;
  perform 1 from public.facility_memberships where facility_id=p_facility_id and user_id=auth.uid() for share;
  if not public.conversation_member(p_facility_id) then raise exception 'A confirmed account and active owner, facility administrator, or inventory editor membership in an approved facility are required.' using errcode='42501'; end if;
end;
$$;
create function private.send_conversation_message(p_id uuid,p_facility_id uuid,p_body text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.conversations; existing public.conversation_messages; mid uuid;
begin
  perform private.require_conversation_member(p_facility_id);
  select * into c from public.conversations where id=p_id;
  perform 1 from public.facilities where id in(c.buyer_facility_id,c.seller_facility_id) order by id for share;
  if not public.conversation_access(p_id) or p_facility_id not in(c.buyer_facility_id,c.seller_facility_id) then
    raise exception 'This conversation is unavailable to your facility, or a participant facility is not approved.' using errcode='42501'; end if;
  if p_request_id is null or p_body is null or length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Enter a message of 1–4,000 characters and a valid submission ID.' using errcode='22023'; end if;
  -- Serialize rate-limit/idempotency checks across every conversation for this sender.
  perform pg_advisory_xact_lock(hashtextextended('h2h-message-user:'||auth.uid()::text,0));
  perform pg_advisory_xact_lock(hashtextextended('h2h-message-facility:'||p_facility_id::text,0));
  select * into existing from public.conversation_messages where author_user_id=auth.uid() and request_id=p_request_id;
  if existing.id is not null then
    if existing.conversation_id<>p_id or existing.author_facility_id<>p_facility_id or existing.body<>btrim(p_body) then
      raise exception 'Submission ID was reused with different content. Refresh the form.' using errcode='22023'; end if;
    return existing.id;
  end if;
  if (select count(*) from public.conversation_messages where author_user_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=20
    or (select count(*) from public.conversation_messages where author_user_id=auth.uid() and created_at>clock_timestamp()-interval '1 hour')>=200
    or (select count(*) from public.conversation_messages where author_facility_id=p_facility_id and created_at>clock_timestamp()-interval '1 minute')>=100
    or (select count(*) from public.conversation_messages where author_facility_id=p_facility_id and created_at>clock_timestamp()-interval '1 hour')>=1000 then
    raise exception 'Message send limit reached. Wait before retrying (20/minute and 200/hour per user; 100/minute and 1,000/hour per facility).' using errcode='22023'; end if;
  update public.conversations set last_sequence=last_sequence+1,updated_at=clock_timestamp() where id=p_id returning * into c;
  insert into public.conversation_messages(conversation_id,sequence,author_user_id,author_facility_id,author_label,body,request_id)
    values(p_id,c.last_sequence,auth.uid(),p_facility_id,coalesce((select nullif(display_name,'') from public.profiles where id=auth.uid()),'Facility member'),btrim(p_body),p_request_id) returning id into mid;
  insert into public.conversation_reads(conversation_id,user_id,last_sequence) values(p_id,auth.uid(),c.last_sequence)
    on conflict(conversation_id,user_id) do update set last_sequence=greatest(public.conversation_reads.last_sequence,excluded.last_sequence);
  return mid;
end;
$$;
revoke all on function private.require_conversation_member(uuid),private.send_conversation_message(uuid,uuid,text,uuid) from public,anon,authenticated;
create function public.contact_listing_seller(p_listing_id uuid,p_buyer_facility_id uuid,p_body text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.listings; cid uuid; existing public.conversation_messages;
begin
  perform private.require_conversation_member(p_buyer_facility_id);
  select * into l from public.listings where id=p_listing_id for share;
  if l.id is null or l.facility_id=p_buyer_facility_id then raise exception 'Choose a listing from another facility.' using errcode='22023'; end if;
  perform 1 from public.facilities where id=l.facility_id for share;
  -- A successful retry can resolve after a listing is sold; no NEW inquiry may.
  select * into existing from public.conversation_messages where author_user_id=auth.uid() and request_id=p_request_id;
  if existing.id is not null then
    select id into cid from public.conversations where id=existing.conversation_id and listing_id=p_listing_id and buyer_facility_id=p_buyer_facility_id;
    if cid is null or existing.body is distinct from btrim(p_body) or not public.conversation_access(cid) then
      raise exception 'Submission is unavailable or has changed.' using errcode='42501'; end if;
    return cid;
  end if;
  if l.status<>'active' or not public.facility_is_public(l.facility_id) then raise exception 'New inquiries require active inventory from an approved seller.' using errcode='22023'; end if;
  insert into public.conversations(listing_id,buyer_facility_id,seller_facility_id)
    values(p_listing_id,p_buyer_facility_id,l.facility_id) on conflict(listing_id,buyer_facility_id) do nothing;
  select id into cid from public.conversations where listing_id=p_listing_id and buyer_facility_id=p_buyer_facility_id;
  perform private.send_conversation_message(cid,p_buyer_facility_id,p_body,p_request_id);
  return cid;
end;
$$;
create function public.reply_to_conversation(p_id uuid,p_facility_id uuid,p_body text,p_request_id uuid) returns uuid
language sql security definer set search_path = '' as $$ select private.send_conversation_message(p_id,p_facility_id,p_body,p_request_id); $$;
create function public.mark_conversation_read(p_id uuid,p_through_sequence bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.conversation_access(p_id) then raise exception 'Conversation access is no longer available.' using errcode='42501'; end if;
  if p_through_sequence is null or p_through_sequence<0 or not exists(select 1 from public.conversations where id=p_id and last_sequence>=p_through_sequence) then
    raise exception 'Invalid read position. Refresh the conversation.' using errcode='22023'; end if;
  insert into public.conversation_reads(conversation_id,user_id,last_sequence) values(p_id,auth.uid(),p_through_sequence)
    on conflict(conversation_id,user_id) do update set last_sequence=greatest(public.conversation_reads.last_sequence,excluded.last_sequence);
end;
$$;
-- A safe participant-only projection includes listing STATUS, not private stock.
create function public.facility_inbox(p_facility_id uuid,p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.conversation_member(p_facility_id) then raise exception 'Select an approved facility with conversation access.' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid inbox page.' using errcode='22023'; end if;
  with items as (
    select c.id,c.listing_id,c.buyer_facility_id,c.seller_facility_id,c.updated_at,p.name,p.catalog_number,m.name as manufacturer,l.status as listing_status,
      bf.name as buyer_name,sf.name as seller_name,
      (select count(*) from public.conversation_messages msg where msg.conversation_id=c.id and msg.author_user_id<>auth.uid()
        and msg.sequence>coalesce((select r.last_sequence from public.conversation_reads r where r.conversation_id=c.id and r.user_id=auth.uid()),0)) as unread
    from public.conversations c join public.listings l on l.id=c.listing_id join public.products p on p.id=l.product_id
    join public.manufacturers m on m.id=p.manufacturer_id join public.facilities bf on bf.id=c.buyer_facility_id join public.facilities sf on sf.id=c.seller_facility_id
    where p_facility_id in(c.buyer_facility_id,c.seller_facility_id) and public.conversation_access(c.id)
  ), paged as (select * from items order by updated_at desc,id limit 20 offset ((p_page::bigint-1)*20))
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged) order by updated_at desc,id) from paged),'[]'::jsonb),
    'total',(select count(*) from items),'unread',coalesce((select sum(unread) from items),0)) into result;
  return result;
end;
$$;
create function public.conversation_page(p_id uuid,p_before_sequence bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.conversation_access(p_id) then raise exception 'Conversation unavailable: check membership and approval of both facilities.' using errcode='42501'; end if;
  if p_before_sequence is not null and p_before_sequence<1 then raise exception 'Invalid message page.' using errcode='22023'; end if;
  with paged as (select * from public.conversation_messages where conversation_id=p_id
    and (p_before_sequence is null or sequence<p_before_sequence) order by sequence desc limit 30)
  select jsonb_build_object('conversation',(select jsonb_build_object('id',c.id,'listing_id',c.listing_id,'buyer_facility_id',c.buyer_facility_id,
      'seller_facility_id',c.seller_facility_id,'buyer_name',bf.name,'seller_name',sf.name,'name',p.name,'catalog_number',p.catalog_number,'listing_status',l.status)
    from public.conversations c join public.listings l on l.id=c.listing_id join public.products p on p.id=l.product_id
    join public.facilities bf on bf.id=c.buyer_facility_id join public.facilities sf on sf.id=c.seller_facility_id where c.id=p_id),
    'messages',coalesce((select jsonb_agg(to_jsonb(paged) order by sequence) from paged),'[]'::jsonb),
    'has_older',exists(select 1 from public.conversation_messages where conversation_id=p_id and sequence<(select min(sequence) from paged))) into result;
  return result;
end;
$$;
revoke all on function public.contact_listing_seller(uuid,uuid,text,uuid),public.reply_to_conversation(uuid,uuid,text,uuid),
  public.mark_conversation_read(uuid,bigint),public.facility_inbox(uuid,integer),public.conversation_page(uuid,bigint) from public,anon;
grant execute on function public.contact_listing_seller(uuid,uuid,text,uuid),public.reply_to_conversation(uuid,uuid,text,uuid),
  public.mark_conversation_read(uuid,bigint),public.facility_inbox(uuid,integer),public.conversation_page(uuid,bigint) to authenticated;
commit;
