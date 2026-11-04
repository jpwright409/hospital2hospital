import "server-only";
// The website queues work with ordinary user permissions. GitHub's worker
// independently validates its sender/provider/service credentials before sending.
export function emailDeliveryConfigured(env: NodeJS.ProcessEnv = process.env) {
 return env.H2H_EMAIL_ENABLED?.trim()==="true";
}
