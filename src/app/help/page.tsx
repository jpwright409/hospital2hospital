import Link from "next/link";
import {randomUUID} from "node:crypto";
import {authenticatedClient,loadAccount,serviceError} from "@/lib/auth/server";
import {getAppMode} from "@/lib/app-mode";
import {SupportForm,SupportScreenshotRetry} from "@/components/support-form";
import {SupportTicketCard} from "@/components/support-ticket";
import type {SupportTicket} from "@/lib/support/types";
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}) {
 if(getAppMode()==='demo') return <div className="container page-section"><h1>Get Help</h1><p className="notice">Support tickets require connected mode. No demo ticket or email is sent.</p><Link href="/faq">Read the FAQ</Link></div>;
 const {supabase,user}=await authenticatedClient();
 if(!user || !user.email_confirmed_at) return <div className="container page-section"><h1>Get Help</h1><p>Sign in with a confirmed account to submit and track a private support ticket. Pending or suspended facilities can still request help.</p><Link className="button primary" href="/auth/login">Sign in</Link><Link className="button secondary" href="/auth/forgot-password">Recover account</Link><Link className="text-link" href="/faq">FAQ</Link>{process.env.H2H_SUPPORT_EMAIL && <p>For help accessing your account: <a href={`mailto:${process.env.H2H_SUPPORT_EMAIL}`}>{process.env.H2H_SUPPORT_EMAIL}</a></p>}</div>;
 const account=await loadAccount();const params=await searchParams;const page=params.page && /^\d+$/.test(params.page) ? Math.min(100000,Math.max(1,Number(params.page))) : 1;
 const tickets=await supabase.from('support_tickets').select('*',{count:'exact'}).eq('user_id',user.id).order('created_at',{ascending:false}).order('id').range((page-1)*10,page*10-1);
 if(tickets.error) throw new Error(serviceError(tickets.error));
 return <div className="container page-section form-container"><h1>Get Help</h1><p>Describe the issue below. Approval is not required to request support.</p><SupportForm id={randomUUID()} name={account.profile.display_name} email={user.email??''} facility={account.active?.name??''} screenshotReady={!!process.env.SUPABASE_SUPPORT_SECRET_KEY}/>
 <h2>Your support tickets</h2>{(tickets.data as SupportTicket[]).map(t=><SupportTicketCard ticket={t} key={t.id}>{t.screenshot_state==='pending' && <SupportScreenshotRetry ticket={t} ready={!!process.env.SUPABASE_SUPPORT_SECRET_KEY}/>}</SupportTicketCard>)}
 {!tickets.data?.length && <p className="notice">No tickets on this page.</p>}<nav className="inventory-pagination" aria-label="Support ticket pages">{page>1 && <Link href={`/help?page=${page-1}`}>Previous</Link>}<span>Page {page}</span>{page*10<(tickets.count??0) && <Link href={`/help?page=${page+1}`}>Next</Link>}</nav>
 </div>;
}
