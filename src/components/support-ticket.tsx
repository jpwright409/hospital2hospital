import Image from "next/image";
import {supportScreenshotUrl} from "@/lib/support/server";
import type {SupportTicket} from "@/lib/support/types";
export async function SupportTicketCard({ticket,children}:{ticket:SupportTicket;children?:React.ReactNode}) {
 let url:string|null=null;let error=false;
 try {url=await supportScreenshotUrl(ticket);}catch{error=true;}
 return <article className="panel support-ticket"><h3>Ticket {ticket.id}</h3><span className="badge">{ticket.status.replaceAll('_',' ')}</span><p>{ticket.contact_name} · {ticket.contact_email}{ticket.contact_phone && ` · ${ticket.contact_phone}`}</p><p>Facility: {ticket.facility_name || "Not provided"}</p><p className="support-issue">{ticket.issue}</p><small>{new Date(ticket.created_at).toLocaleString('en-US',{timeZone:'UTC'})} UTC</small>
 {url && <a href={url} target="_blank" rel="noopener noreferrer"><Image src={url} alt="Screenshot attached to this support ticket" width={ticket.screenshot_width??1200} height={ticket.screenshot_height??900} unoptimized/></a>}
 {error && <p className="error">Screenshot could not be loaded. Refresh to retry.</p>}
 {ticket.screenshot_state==='pending' && <p className="notice">Screenshot upload is unfinished. Ticket text has been saved.</p>}
 {ticket.screenshot_state==='ready' && <p className="muted">Private screenshot links expire after 60 seconds; refresh this page to renew.</p>}{children}
 </article>;
}
