// Operator-only helper. Never import this into the website or an API route.
export const TARGET_EMAIL = 'paul@babursolutions.com';
export const PROJECT_ORIGIN = 'https://rmgvchexfacjigukyvrx.supabase.co';

export function recoveryConfig(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.SUPABASE_SECRET_KEY?.trim();
  let configured = false;
  try {
    const parsed = new URL(url);
    configured = parsed.origin === PROJECT_ORIGIN && parsed.pathname === '/' &&
      !parsed.search && !parsed.hash && !parsed.username && !parsed.password && !!key;
  } catch { /* Configuration check must not print credential values. */ }
  return {configured, url, key};
}

function checkAccount(user, expectedId) {
  if (!user?.id || user.email?.toLowerCase() !== TARGET_EMAIL || (expectedId && user.id !== expectedId)) {
    throw new Error('The exact recovery account could not be verified. No password change was requested.');
  }
  if (!user.email_confirmed_at) throw new Error('This account is not email-confirmed. This tool will not bypass email verification.');
  if (user.banned_until && Date.parse(user.banned_until) > Date.now()) throw new Error('This account is suspended in Auth. Resolve that separately before recovering its password.');
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Choose a password of 12-128 characters. Nothing was changed.');
  }
}

export async function findRecoveryAccount(admin) {
  let match;
  for (let page=1;page<=100;page++) {
    let result;
    try { result = await admin.listUsers({page, perPage:200}); }
    catch { throw new Error('Account lookup failed. Check the server-only key and connection.'); }
    if (result.error || !Array.isArray(result.data?.users)) throw new Error('Account lookup failed. Check the server-only key and connection.');
    for (const user of result.data.users) {
      if (user.email?.toLowerCase() !== TARGET_EMAIL) continue;
      if (match) throw new Error('Multiple matching accounts were returned. Nothing was changed.');
      checkAccount(user);
      match = user;
    }
    if (result.data.users.length < 200) {
      if (!match) throw new Error('The exact recovery email was not found in this project. Nothing was changed.');
      return match;
    }
  }
  throw new Error('Account lookup exceeded its safety limit. Nothing was changed.');
}

export async function resetRecoveryPassword(admin, id, password) {
  validatePassword(password);
  let current;
  try { current = await admin.getUserById(id); }
  catch { throw new Error('Account recheck failed. Nothing was changed.'); }
  if (current.error) throw new Error('Account recheck failed. Nothing was changed.');
  checkAccount(current.data?.user, id);
  let result;
  try { result = await admin.updateUserById(id, {password}); }
  catch { throw new Error('The password change could not be confirmed. Try logging in with your new password before retrying.'); }
  if (result.error) {
    if (result.error.code === 'weak_password') throw new Error('Supabase rejected that password as too weak. Choose a stronger password and retry.');
    throw new Error('The password change could not be confirmed. Check Auth status and try logging in before retrying.');
  }
  try {checkAccount(result.data?.user, id);}
  catch {throw new Error('The update response could not be verified. Try logging in with the new password before retrying.');}
}
