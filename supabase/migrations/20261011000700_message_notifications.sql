begin;
-- A caller-only summary across eligible facilities, never arbitrary account IDs.
-- Reads remain personal; threads and message history remain facility-shared.
create function public.my_message_facilities() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(summary) order by summary.name,summary.id),'[]'::jsonb)
  from (
    select f.id,f.name,
      (select count(*) from public.conversations c
        join public.conversation_messages msg on msg.conversation_id=c.id
        where f.id in(c.buyer_facility_id,c.seller_facility_id)
          and public.conversation_access(c.id)
          and msg.author_user_id<>auth.uid()
          and msg.sequence>coalesce((select r.last_sequence from public.conversation_reads r
            where r.conversation_id=c.id and r.user_id=auth.uid()),0)) as unread
    from public.facilities f where public.conversation_member(f.id)
  ) summary;
$$;
revoke all on function public.my_message_facilities() from public,anon;
grant execute on function public.my_message_facilities() to authenticated;

-- A messaging switch may select only a live, approved, eligible membership.
create function public.select_message_facility(p_facility_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_conversation_member(p_facility_id);
  perform public.set_active_facility(p_facility_id);
end;
$$;
revoke all on function public.select_message_facility(uuid) from public,anon;
grant execute on function public.select_message_facility(uuid) to authenticated;
commit;
