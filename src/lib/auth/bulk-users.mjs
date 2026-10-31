export const MAX_BULK_USERS=20;
// Presentation only. Guarded SQL checks current roles/ownership/status again.
export function bulkUserEligible(user,operation){
 if(user.platform_administrator||user.action_pending||!user.email)return false;
 if(operation==='remove')return !user.facility_owner;
 if(operation==='disable')return !user.disabled;
 if(operation==='reset')return !!user.email_confirmed_at&&!user.disabled;
 return false;
}
export function parseBulkUserRequest(form){
 const operation=String(form.get('operation')??'');
 const reason=String(form.get('reason')??'').trim();
 if(!['remove','disable','reset'].includes(operation)||form.get('confirm')!=='yes'||reason.length<10||reason.length>500)throw new Error('Choose an action, provide a reason of 10–500 characters, and confirm the selected accounts.');
 if(operation==='remove'&&form.get('remove_confirmation')!=='REMOVE')throw new Error('Type REMOVE to confirm permanent removal of the selected accounts.');
 const raw=String(form.get('targets')??'');if(raw.length>20000)throw new Error('Too many accounts selected.');
 let targets;try{targets=JSON.parse(raw);}catch{throw new Error('Account selection is invalid. Refresh and select accounts again.');}
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 if(!Array.isArray(targets)||targets.length<1||targets.length>MAX_BULK_USERS||targets.some(t=>!t||!uuid(t.id)||!uuid(t.requestId)||typeof t.email!=='string'||t.email.length>254||!/^\S+@\S+\.\S+$/.test(t.email))||new Set(targets.map(t=>t.id)).size!==targets.length||new Set(targets.map(t=>t.requestId)).size!==targets.length)throw new Error('Select 1–20 distinct accounts with valid submission IDs.');
 return {operation,reason,targets:targets.map(t=>({id:t.id,email:t.email.toLowerCase(),requestId:t.requestId}))};
}
