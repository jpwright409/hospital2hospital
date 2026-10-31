// Supabase validates this single-use token with Turnstile. Never validate it
// separately here: doing so consumes it before Supabase can check it.
export function captchaOptions(form, siteKey) {
  if (!siteKey?.trim()) return {};
  const token = form.get('captcha_token');
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
    throw Object.assign(new Error('Complete security verification before continuing.'), { code: 'captcha_required' });
  }
  return { captchaToken: token.trim() };
}
