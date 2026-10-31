import Link from "next/link";
import {randomUUID} from "node:crypto";
import {requirePlatformAdministrator,serviceError} from "@/lib/auth/server";
import {UserManagementForm,type ManagedUser} from "@/components/user-management";
import {UserDirectory} from "@/components/user-directory";

type Audit={id:string;action:string;email:string;actor_id:string;reason:string;state:string;created_at:string};
export const maxDuration=120;
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;page?:string;status?:string}>}){
 const {supabase}=await requirePlatformAdministrator(),params=await searchParams;
 const q=typeof params.q==="string"?params.q.trim().slice(0,100):"",page=typeof params.page==="string"&&/^\d+$/.test(params.page)?Math.max(1,Math.min(100000,Number(params.page))):1;
 const status=['all','unconfirmed','confirmed','disabled'].includes(params.status??'')?params.status!:'all';
 const [directory,audit]=await Promise.all([supabase.rpc("admin_user_directory_v2",{p_query:q,p_page:page,p_status:status}),supabase.rpc("admin_account_audit")]);
 if(directory.error||audit.error)throw new Error(serviceError(directory.error??audit.error));
 const data=directory.data as {total:number;items:ManagedUser[]};
 const url=(n:number)=>'/admin/users?'+new URLSearchParams({q,page:String(n),status});
 return <div className="container page-section"><h2 className="facilitator-section-title">Users</h2><p>Review accounts and manage selected users. New accounts still require separate facility approval; unfamiliar names alone do not establish abuse.</p>
  <details className="panel user-invite"><summary>Add a user manually</summary><p>The recipient receives an invitation to choose their own password. No facility membership or administrator role is granted.</p><UserManagementForm requestId={randomUUID()}/></details>
  <form action="/admin/users" className="user-directory-filters"><label>Name or email<input name="q" type="search" placeholder="Search accounts" maxLength={100} defaultValue={q}/></label><label>Status<select name="status" defaultValue={status}><option value="all">All accounts</option><option value="unconfirmed">Awaiting confirmation</option><option value="confirmed">Email confirmed</option><option value="disabled">Disabled</option></select></label><button className="button secondary">Search users</button></form>
  <p className="muted">{data.total} accounts ? 20 per page ? Newest first</p><UserDirectory key={q+'-'+page+'-'+status} users={data.items}/>{!data.items.length&&<p className="notice">No matching accounts.</p>}
  <nav className="inventory-pagination" aria-label="User directory pages">{page>1&&<Link href={url(page-1)}>Previous</Link>}<span>Page {page} of {Math.max(1,Math.ceil(data.total/20))}</span>{page*20<data.total&&<Link href={url(page+1)}>Next</Link>}</nav>
  <section className="panel user-audit" id="account-audit"><h3>Recent account administration</h3><p>Requested or uncertain operations require checking Supabase Auth before retrying. A failed disable or removal keeps access blocked. Cleanup actions are limited to 200/hour; email and identity actions share a 20/hour limit.</p>{(audit.data as Audit[]).map(a=><div className="user-audit-entry" key={a.id}><strong>{a.action} ? {a.email||"Existing account"} ? {a.state}</strong><p>{a.reason}</p><small>{new Date(a.created_at).toLocaleString("en-US",{timeZone:"UTC"})} UTC ? Actor {a.actor_id} ? Request {a.id}</small></div>)}{!audit.data.length&&<p>No account actions recorded yet.</p>}</section>
 </div>;
}
