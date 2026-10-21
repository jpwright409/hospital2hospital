// Narrow Auth operations only. Caller authentication, permission, rate limits,
// target protection and idempotency must be authorized by the audit RPC first.
export async function performUserAdminOperation(admin, operation, redirectTo) {
 const {action,targetId,email,expectedEmail,name}=operation;
 if(!['invite','email','disable','enable','reset'].includes(action))throw new Error('Unsupported account action.');
 if(action==='invite'){
  const result=await admin.auth.admin.inviteUserByEmail(email,{data:{display_name:name},redirectTo});
  if(result.error)throw result.error;
  if(!result.data?.user?.id||result.data.user.email?.toLowerCase()!==email)throw new Error('Invitation response could not be verified.');
  return result.data.user.id;
 }
 const current=await admin.auth.admin.getUserById(targetId);
 if(current.error)throw current.error;
 const user=current.data?.user;
 if(user?.id!==targetId||user.email?.toLowerCase()!==expectedEmail)throw new Error('Account changed. Refresh before retrying.');
 if(action==='reset'){
  if(!user.email_confirmed_at||Date.parse(user.banned_until??'')>Date.now())throw new Error('Reset requires a confirmed, enabled account.');
  const result=await admin.auth.resetPasswordForEmail(user.email,{redirectTo});if(result.error)throw result.error;
 }else{
  const attributes=action==='email'?{email}: {ban_duration:action==='disable'?'876000h':'none'};
  const result=await admin.auth.admin.updateUserById(targetId,attributes);if(result.error)throw result.error;
  if(result.data?.user?.id!==targetId)throw new Error('The update response could not be verified.');
 }
 return null;
}
