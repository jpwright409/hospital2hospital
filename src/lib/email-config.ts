import "server-only";
export function emailDeliveryConfigured() {
 return process.env.H2H_EMAIL_ENABLED==="true" && !!process.env.RESEND_API_KEY && !!process.env.H2H_EMAIL_FROM && !!process.env.SUPABASE_EMAIL_SECRET_KEY;
}
