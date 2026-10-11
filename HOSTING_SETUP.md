# Hospital2Hospital launch setup

Chosen services: GoDaddy domain/DNS, Vercel website hosting, existing Supabase project, Resend outgoing email, Google Workspace incoming email. Nothing in this checklist has been configured remotely by Codex.

## Before connecting accounts

- Confirm whether Vercel and Resend accounts exist and which business account will own them. Use a Vercel plan suitable for commercial use.
- Confirm the project's Git repository URL and production branch. Import the repository into Vercel with `hospital2hospital` as Root Directory if the repository contains the parent directory; otherwise use the repository root. Use its Next.js preset and a supported Node version compatible with the installed dependencies.
- Confirm that hospital2hospital.com is already verified in Google Workspace and which existing inbox receives each alias. A user alias routes to one inbox; use a Google Group/shared arrangement if several staff need delivery.
- Do not send passwords, API keys, or secret keys in chat. Enter them in each service's settings or an appropriate secret store. Never commit .env.local.

## Google Workspace and Resend

1. Add `info@hospital2hospital.com` and `support@hospital2hospital.com` as aliases to the chosen Workspace user(s). If the domain is not already in Workspace, add/verify it first. Configure Gmail's send-as setting if staff should reply from an alias. Test incoming email to both addresses.
2. In Resend, add and verify the sending domain `hospital2hospital.com` so automated mail can use those exact addresses. Configure sending only; Google Workspace remains responsible for receiving mail.
3. At the authoritative DNS provider, add the exact verification/DKIM and sending return-path records Resend provides. A Resend MX record for a sending/bounce subdomain is different from the root-domain MX records used for Google inboxes. Do not replace Google's root MX records or enable Resend receiving on the root domain.
4. Preserve Google DKIM and verification records. Keep at most one SPF policy at each DNS name; do not paste a second conflicting root SPF record. Review DMARC alignment with the verified sender and retain existing policy unless a deliberate change is required.
5. Use `Hospital2Hospital <info@hospital2hospital.com>` for automated account, referral and watchlist emails initially. `support@hospital2hospital.com` is the human support address. Replies to info go to its Workspace alias destination; an explicit support Reply-To is an optional later application change, not currently implemented.

## Supabase account mail

In the existing project, configure custom SMTP with Resend:

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: the Resend API key, entered privately
- Sender name: Hospital2Hospital
- Sender email: `info@hospital2hospital.com`

Use the current Resend/Supabase dashboard instructions if their interface changes. This config handles confirmation/recovery emails separately from the app's referral/watchlist worker.

Set Supabase Auth Site URL to `https://hospital2hospital.com` when the production site is ready. Add exact production redirect URLs for `/auth/callback`, `/auth/confirm`, `/auth/recovery`, and `/auth/update-password`. Keep only necessary local redirect URLs. See SUPABASE_SETUP.md for confirmation/recovery templates. Its existing templates use SiteURL, so local signup emails will point to production after this switch; use a separate development project later if independent local Auth testing is needed.

## Existing Supabase project

Reusing it is an accepted launch preference, not a requirement to create another project. Before treating it as production:

- Verify which migrations through 014 are actually applied; apply only missing ones using the documented process.
- Export/back up existing data and review catalog, accounts, facilities, listings and conversations for test fixtures. Do not automatically purge data or reimport fake stock.
- Confirm administrator bootstrap, RLS and private Storage configuration; exercise actual authorization and upload flows.
- Treat the project as live after launch: local changes pointed at it can change customer data. Establish backup/restore and migration review procedures.

## Vercel settings

Enter production environment variables from `.env.example` in Vercel, not in committed files:

```text
NEXT_PUBLIC_APP_MODE=connected
NEXT_PUBLIC_SITE_URL=https://hospital2hospital.com
NEXT_PUBLIC_SUPABASE_URL=<existing project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_SECRET_KEY=<server-only photo processing key>
SUPABASE_SUPPORT_SECRET_KEY=<server-only support image processing key>
H2H_SUPPORT_EMAIL=support@hospital2hospital.com
H2H_EMAIL_FROM=Hospital2Hospital <info@hospital2hospital.com>
RESEND_API_KEY=<server-only Resend key>
SUPABASE_EMAIL_SECRET_KEY=<server-only email worker credential>
H2H_EMAIL_ENABLED=false
```

Keep email disabled until Resend verification and a tested worker schedule are ready. Do not share production secrets with untrusted preview deployments. Public build-time variables require a new build after changes.

## Work required before a complete production launch

- Adapt the 5 MiB photo/screenshot/headshot upload path for Vercel's 4.5 MB function request limit, or consistently lower the application upload limit below that threshold with room for multipart overhead. Increasing Next.js bodySizeLimit alone does not bypass Vercel's limit. Preserve server-side image validation and private access controls.
- Add and test a secured scheduled execution mechanism for `scripts/email-worker.mjs`. It already claims/sends/records queued jobs with retries, but deployment alone does not schedule it. A protected server endpoint invoked by Vercel Cron is one option; its service credentials must stay server-only. No cron endpoint/configuration is currently installed.
- Choose an initial cadence such as every five minutes and monitor queue age/provider failures. Keep photo/support cleanup schedules separate and scoped to existing journal procedures.
- Test at the temporary deployment URL before connecting public traffic. Validate account emails, login/recovery, approvals, listing mutations/uploads, saves, messages, boost review, support tickets and email job delivery. Confirm ordinary Google inbox delivery still works.

## GoDaddy domain cutover

1. Confirm GoDaddy is also the authoritative DNS host; registration alone does not prove that it is.
2. Add `hospital2hospital.com` and `www.hospital2hospital.com` in Vercel's project Domains settings. Choose the bare domain as primary and redirect www to it.
3. Copy Vercel's exact requested A/CNAME/verification records into DNS. Do not guess IP addresses or CNAME targets from older guides. Change only relevant website records, preserving Google Workspace and Resend records. Nameserver migration is unnecessary when current DNS can provide these records.
4. Verify domain resolution and HTTPS, then perform the live workflow tests. Test email links and replies with an account outside the Supabase project team.

## Official references

- Vercel custom domains: https://vercel.com/docs/domains/working-with-domains/add-a-domain
- Vercel request limits: https://vercel.com/docs/errors/function_payload_too_large
- Vercel scheduled jobs: https://vercel.com/docs/cron-jobs
- Resend domain verification: https://resend.com/docs/dashboard/domains/introduction
- Resend SMTP for Supabase: https://resend.com/docs/send-with-supabase-smtp
- Supabase redirects: https://supabase.com/docs/guides/auth/redirect-urls
- Google Workspace aliases: https://support.google.com/a/answer/33327

## Account/repository details provided

- GitHub repository: https://github.com/jpwright409/hospital2hospital.git (initially empty).
- Vercel account/team identifier supplied: paul-3870. User will import the GitHub repository once populated.
- Resend account exists under paul@babursolutions.com. RESEND_API_KEY is stored locally in ignored .env.local; it must also be entered privately in production settings and Supabase SMTP. No key values are copied into documentation or Git.
- Workspace alias destinations and Resend sending-domain verification are still to be confirmed.
