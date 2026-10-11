"use client";
import { ActionForm } from "./account-forms";
import { updateContacts } from "@/app/facility-actions";
export function FacilityContactForm({contact,facilityId}: {contact:Record<string,string|boolean>;facilityId:string}) {
 return <ActionForm action={updateContacts} submit="Save contacts">
 <input type="hidden" name="facility_id" value={facilityId}/>
 <h2>Designated business contact</h2><p>Only share a contact you have permission to disclose to approved buyer facilities.</p>
 {(["name","email","phone"] as const).map(field=><label key={field}>{field}<input name={`business_${field}`} type={field==="email" ? "email" : "text"} maxLength={field==="name" ? 120 : field==="email" ? 254 : 40} defaultValue={String(contact[`business_${field}`]??"")}/></label>)}
 <label><input type="checkbox" name="share_business_contact" value="yes" defaultChecked={contact.share_business_contact===true}/> Share this business contact with eligible approved buyers on active listings</label>
 <h2>Secondary facility contact</h2><p>For continuity if the primary contact leaves. Visible only to active facility owners and administrators. This does not create membership, account recovery rights, or ownership transfer.</p>
 {(["name","email","phone"] as const).map(field=><label key={field}>Secondary {field}<input name={`secondary_${field}`} type={field==="email" ? "email" : "text"} maxLength={field==="name" ? 120 : field==="email" ? 254 : 40} defaultValue={String(contact[`secondary_${field}`]??"")}/></label>)}
 </ActionForm>;
}
