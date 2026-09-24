# AADRIQUE Doctor OS

**Your OPD. One intelligent workspace.**

A doctor-first operating system for OPD workflow, patient records, appointments,
queue management, communication and AI-assisted documentation.

Built against `../AADRIQUE_Doctor_OS_Build_Spec.md`. Code comments cite that
document by section (`spec §12`).

---

## Running it

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and AUTH_SECRET
npm run db:deploy           # apply migrations
npm run db:seed             # the demo organisation
npm run dev
```

Open <http://localhost:3000> and sign in with a demo account (password
`aadrique123`; set `DEMO_MODE=true` to have the sign-in page list them).
Each role lands in its own workspace: doctors in `/doctor`, nurses in
`/nurse`, the front desk in `/reception`, administrators in `/admin`.

For development a local Postgres is much faster than a hosted one in another
region; `.env.example` shows both.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` / `npx eslint .` | Type check / lint |
| `npm test` | Unit tests — rules, permissions, AI safety, templates, CSV |
| `npm run test:integration` | The services against the real database, on throwaway tenants |
| `npm run test:e2e` | The spec §53 journeys in a browser (resets the demo data; local databases only) |
| `npm run org:create -- …` | Set up a real clinic and its first admin (see below) |
| `npm run db:backup` | A verified `pg_dump` of everything, uploaded files included |

### Deploying

Everything the server reads is listed, with notes, in `.env.example`. In
short:

| Setting | Why |
|---|---|
| `DATABASE_URL`, `DIRECT_DATABASE_URL` | Postgres; run `npm run db:deploy` on release |
| `AUTH_SECRET` | Signs staff sessions, patient portal sessions and patient links |
| `AUTH_TRUST_HOST=true` | Outside Vercel, so Auth.js accepts the host |
| `TZ` | The clinic's time zone — "today" is the server's local day |
| `APP_URL` | The public address — token links and password-reset links are built from it |
| `CRON_SECRET` | Authorises the scheduler that resumes waiting workflows (`/api/jobs/workflows`; `vercel.json` schedules it) |
| `WHATSAPP_*`, `MSG91_AUTH_KEY`, `RESEND_*` | Real messaging; each integration names its credential as `env://VARIABLE` |
| `AUTH_EMAIL_FROM` | With `RESEND_API_KEY`, "Forgot password?" emails a reset link; without, it asks the clinic's admin |
| `ERROR_ALERT_WEBHOOK_URL` | Optional: each distinct server error posted to a chat webhook |

Host the app in the same region as its database. Never set `DEMO_MODE` or
`PORTAL_DEMO_CODES` on a real deployment; the demo seed refuses to run in
production or beside a real clinic.

### Setting up a real clinic

```bash
npm run org:create -- \
  --name "Sunrise Clinics" --slug sunrise \
  --facility "Sunrise Clinic, Kondapur" --code SUN-KDP --city Hyderabad \
  --phone "040 4000 1234" --admin-name "Priya Menon" --admin-email priya@sunrise.example
```

It prints the admin's one-time password. The admin signs in, chooses a
password, adds doctors (Admin → Doctors) and staff (Admin → Staff), and
connects messaging. The clinic starts with the standard templates and
automations; patients book at `/portal/sunrise`.

### Connecting messaging

Until a channel is connected, messages go through a simulated gateway and
are labelled "simulated" everywhere they appear. To send for real:

1. Put the vendor credential in the environment — `WHATSAPP_ACCESS_TOKEN`
   (Meta Cloud API), `MSG91_AUTH_KEY` (MSG91) or `RESEND_API_KEY` (Resend).
2. In Admin → Integrations, set the channel's settings (WhatsApp phone
   number id; SMS sender id; email from-address on a verified domain) and
   its credential as `env://WHATSAPP_ACCESS_TOKEN` (etc.), then Connect —
   the health check decides the status.
3. Indian SMS needs DLT: give every SMS template its approved MSG91 flow id.
   WhatsApp messages outside the 24-hour window need approved templates.
4. For delivery receipts and replies, point Meta's webhook at
   `/api/webhooks/whatsapp` (`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`)
   and a Resend webhook at `/api/webhooks/resend` (`RESEND_WEBHOOK_SECRET`).

### Running it in production

- **Monitoring** — server errors are logged as one scrubbed JSON line each
  (no patient data); `ERROR_ALERT_WEBHOOK_URL` also alerts a chat channel.
  Point an uptime monitor at `/api/health` (200, or 503 without a database).
- **Backups** — keep the host's point-in-time recovery on (Neon, Supabase and
  RDS all have it) and take an off-site copy with `npm run db:backup` on a
  schedule. Uploaded files live in Postgres, so one backup covers both.
  Restore into a scratch database now and then to prove it works.
- **Patient data requests** (DPDP Act 2023) — Admin → Patients → a patient:
  *Export data* downloads everything held about them; *Erase identity*
  removes who they are while the clinical record stays, de-identified, for
  its legal retention period.

---

## What it does

- **Doctor** — Command Center with the live queue and one-click Call Next;
  the consultation workspace with autosaving drafts and signing; prescriptions
  with allergy warnings, issued on signing and printable; Patient 360 with
  lab reports and documents;
  consultations worklist; schedule; follow-ups; messages; analytics; the AI
  Copilot (pre-consultation brief, note drafting, history search), always
  marked as AI and never writing to a signed record; a profile with clinic
  hours and an on-duty switch.
- **Nurse** — a vitals station listing everyone in today's queues, those
  still to be measured first; readings flow into the consultation, and
  abnormal ones are flagged.
- **Front desk** — registration, instant search, walk-in tokens with
  priority, booking for any doctor, today's arrivals and check-in, every
  doctor's queue on one screen, notifications.
- **Patients** — a portal at `/portal/<organisation>`: sign in with a code
  sent to their mobile, book and cancel, follow their token, rate a visit.
  A waiting-room display (`/display`) and a personal live token page. Token
  numbers only on public screens, never names.
- **Admin** — doctors (add, department, clinic hours), staff accounts (add,
  reset password, remove access), departments, patient directory with
  audited export, operations, reports, audit log, AI activity, integrations,
  and communications: a template editor and a workflow builder.
- **Messaging** — WhatsApp (Meta Cloud API), SMS (MSG91) and email (Resend)
  once an integration is connected; signed delivery receipts and WhatsApp
  replies into the inbox. Until then, a clearly labelled simulated gateway.
- **Accounts** — forgotten passwords by emailed link (or a request to the
  admin), and optional two-factor sign-in with an authenticator app.
- **Throughout** — queues update without a refresh; permissions and tenant
  boundaries are enforced on the server; every important action is audited;
  sessions end the moment a password changes or access is removed; a
  nonce-based CSP; rate limiting shared across instances; automations are
  data (spec §28), not code.

### Not built yet

Multi-location operations (per-facility queues, reports and staff — the
schema carries facilities, but screens work across the organisation),
advanced analytics beyond the doctor and admin reports, an organisation-wide
rule that makes two-factor mandatory, and patients downloading their own data
from the portal (the admin export covers the request today).

---

## Layout

```
src/
  app/
    (dashboard)/        every workspace route, rendered inside the shell
      doctor/           home, queue, appointments, patients, consultations,
                        follow-ups, messages, analytics, copilot, profile
      nurse/            the vitals station
      reception/        front desk, queue, appointments, patients, notifications
      admin/            overview, doctors, departments, operations, reports,
                        audit, communications, AI, integrations, settings
      design/           design system reference
    (auth)/             sign-in, forgot and reset password
    display/            the waiting-room screen
    q/[code]/           a patient's live token page (signed link)
    print/              the printable prescription
    account/            password and two-factor
    api/                health, documents, patient export, jobs, webhooks
    globals.css         design tokens and base layer
  components/
    ui/                 primitives — button, card, badge, status, command, …
    shell/              sidebar, topbar, command palette, live refresh, …
    reception/          registration, walk-ins, arrivals, facility queue
    doctors/            clinic-hours editor, practice settings
  hooks/                global shortcuts, dialog state, mounted guard
  types/                shell-level domain types
  server/
    context.ts          builds the authorized actor from the session
    rules/              pure, unit-tested decisions — slots, lifecycle,
                        queue order, clinic hours
    services/           all database access lives behind these
    setup/              org:create and the starter templates and automations
  lib/                  nav config, session, sidebar store, utils, and:
    ai/                 provider abstraction — Claude, and the grounded
                        fallback that needs no credentials
    integrations/       connect / healthCheck / sync adapters per system
    security/           rate limiting, signed links, CSP, sealed secrets
    storage/            the file store behind uploads, and file-type checks
    observability/      the scrubbed error report
    workflow/           the automation step vocabulary
    auth/               Auth.js config, passwords, reset links, TOTP
    db/                 Prisma client singleton
    messaging/          WhatsApp / SMS / email provider abstraction
    permissions/        role matrix, tenant + permission assertions
  proxy.ts              redirects unauthenticated users to sign-in
prisma/
  schema.prisma         the data model (44 models)
  seed.ts               the demo dataset
scripts/                org:create, backup
e2e/                    browser journeys (Playwright)
```

---

## Conventions

Architecture, AI safety and design rules are in [`AGENTS.md`](./AGENTS.md).
