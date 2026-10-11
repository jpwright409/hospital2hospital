import Link from "next/link";
import {requirePlatformAdministrator,serviceError} from "@/lib/auth/server";
import {SupportTicketCard} from "@/components/support-ticket";
import {SupportStatusForm} from "@/components/support-form";
import type {SupportTicket} from "@/lib/support/types";
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}) {
 const {supabase}=await requirePlatformAdministrator();const params=await searchParams;
 const page=params.page && /^\d+$/.test(params.page) ? Math.min(100000,Math.max(1,Number(params.page))) : 1;
 const result=await supabase.from('support_tickets').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id').range((page-1)*10,page*10-1);
 if(result.error) throw new Error(serviceError(result.error));
 return <div className="container page-section conversation-container"><h1>Platform support tickets</h1><p>Only platform administrators can review all tickets and update their status. Facility roles do not grant this access.</p>
 {(result.data as SupportTicket[]).map(t=><SupportTicketCard key={t.id} ticket={t}><p className="muted">Submitting account: {t.account_email}</p><SupportStatusForm id={t.id} status={t.status}/></SupportTicketCard>)}
 <nav className="inventory-pagination" aria-label="Platform support pages">{page>1 && <Link href={`/admin/support?page=${page-1}`}>Previous</Link>}<span>Page {page}</span>{page*10<(result.count??0) && <Link href={`/admin/support?page=${page+1}`}>Next</Link>}</nav></div>;
}
