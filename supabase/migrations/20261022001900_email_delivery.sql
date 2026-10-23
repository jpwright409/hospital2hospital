begin;
-- A service worker has no caller UID: explicitly recheck the queued user's live access.
create or replace function public.claim_email_jobs(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.email_jobs;items jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid batch size.' using errcode='22023'; end if;
 for job in select * from private.email_jobs where state='pending' or (state='sending' and claimed_at<clock_timestamp()-interval '10 minutes') order by created_at for update skip locked limit p_limit loop
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
