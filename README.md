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
npm run dev
```

Open <http://localhost:3000>. The root redirects into the doctor workspace.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with Turbopack |
| `npm run build` | Production build |
| `npx tsc --noEmit` | Type check |
| `npx eslint .` | Lint |

---

## Build status

**Part 5 — workflow engine, integrations, administration, security review. Complete.**

- **Workflow engine** (§28) — automations are data, not branches. A trigger
  and a list of WAIT / CONDITION / ACTION steps on a row, so a clinic changes
  when patients hear from it without a deploy. The appointment confirmation,
  the 24-hour reminder, the token message, the cancellation notice and the
  post-visit feedback request all moved out of the services and into
  workflows. Conditions read live data — "is it *still* scheduled?" cannot be
  answered from a snapshot — and a trigger is always fired after the
  transaction it belongs to commits, so an automation can never roll back a
  booking. Waiting runs resume through `POST /api/jobs/workflows`.
- **Integrations** (§29) — WhatsApp, SMS, email, lab, pharmacy and HMS behind
  one connect/healthCheck/sync adapter, with the spec's four states derived
  from what the adapter reported rather than typed in. Settings are stored;
  credentials are a pointer into the secret store, and anything secret-shaped
  is redacted before it leaves the server.
- **Operational intelligence** (§17) — bottleneck detection at
  [`/admin/operations`](http://localhost:3000/admin/operations): wait times
  against each department's own threshold, consultations running long, paused
  queues, failed messages, unhealthy integrations. Every insight states the
  measurement behind it. Operational analytics, never a clinical judgement.
- **Administration** — hospital overview, doctor and department directories,
  editable queue thresholds, and a role screen showing what each role can
  actually do after this organization's overrides.
- **Security review** (§31) — sign-in rate limiting enforced inside
  `authorize` (where the REST endpoint meets the form, not just the form),
  security headers on every response, a scheduled endpoint that fails closed
  without its secret, and prompt-injection defences on the document-based AI.

**Part 4 — AI abstraction, pre-consultation brief, documentation copilot. Complete.**

The AI layer is built so that the safety rules in spec §10 are structural
rather than promised. Retrieval happens *before* any model call, the retrieved
records travel with the request, and a citation to a record that was not
supplied is dropped before a doctor sees it.

- **Works with no model configured.** Without `ANTHROPIC_API_KEY`, the grounded
  provider composes the same answers deterministically from the patient's own
  records — nothing is generated, so nothing can be invented. With a key,
  Claude writes them and the citations are validated against the record. The UI
  always says which one answered.
- **Pre-consultation brief** (§8) — ready on every open consultation, with the
  record rows it was built from linked beside each section. Generated once per
  visit, then read back, and streamed so the workspace never waits on it.
- **Documentation copilot** (§9) — dictate or paste, and it comes back laid out
  under clinical headings. It adds nothing and drops nothing; "Insert into
  note" is the explicit step, and it appends rather than overwrites.
- **Retrieval** (§9) — natural-language search over one patient's record, and a
  hospital knowledge assistant that quotes approved SOPs and policies only.
- **Review lifecycle** (§10, §30) — every output is an `AIAction` awaiting a
  doctor's decision, never a chart entry. Generated, accepted and rejected are
  all audited, and [`/admin/ai`](http://localhost:3000/admin/ai) shows the lot.

**Part 3 — appointments, follow-ups, communication, analytics, audit. Complete.**

- **Appointments** (§11) — the doctor's schedule as a day or a week, booking
  against live availability, reschedule that keeps the original on the record,
  cancellation, no-show tracking, and check-in that turns an appointment into a
  queue token in one transaction.
- **Follow-ups** (§42) — overdue, due today and upcoming, with one-tap
  reminders, booking the return visit, and a reactivation list of patients who
  were promised a follow-up and never rebooked.
- **Communication centre** (§14) — one inbox across WhatsApp, SMS and email,
  grouped by patient, with delivery state on every message, template-driven
  composing, consent enforced before anything is written, and retry on failure.
  Gateways sit behind `src/lib/messaging/`; the simulated provider exercises the
  full queued → sent → delivered → read pipeline without a vendor account.
- **Analytics** (§16) — one primary trend chart and compact metric cards, for
  the doctor at [`/doctor/analytics`](http://localhost:3000/doctor/analytics)
  and the hospital at [`/admin/reports`](http://localhost:3000/admin/reports).
  Every rate carries its denominator and says so when there is nothing to
  measure.
- **Audit log** (§30) — who did what, to which record, and when, at
  [`/admin/audit`](http://localhost:3000/admin/audit), filterable by action,
  person and date. Nothing clinical is ever written into it.

**Part 2c — patients, Patient 360, queue actions, consultation workspace. Complete.**

The MVP journey from spec §40 now runs end to end: sign in → dashboard → queue
→ Call Next → consultation → write the note → sign → queue updates.

- **Queue actions** (§12) — Call Next (`N`), complete, move to vitals, skip as
  no-show, pause/resume. Calling the next patient closes out whoever is with
  the doctor, opens their visit and creates the draft consultation, in one
  transaction.
- **Patients** (§13) — search by name, mobile, patient ID or appointment ID,
  debounced, `/` to focus.
- **Patient 360** (§7) — one timeline across consultations, prescriptions, lab
  reports, messages, appointments and follow-ups, with filters.
- **Consultation workspace** (§6) — patient snapshot, the structured note with
  autosave, history/medications/orders tabs, and signing. A signed consultation
  is immutable.

**Part 2b — authentication, service layer, Doctor Command Center. Complete.**

Sign in at [`/sign-in`](http://localhost:3000/sign-in) with any seeded account
(password `aadrique123`):

| Account | Role |
|---|---|
| `ananya.rao@aadrique.demo` | Doctor |
| `frontdesk@aadrique.demo` | Receptionist |
| `nurse@aadrique.demo` | Nurse |
| `admin@aadrique.demo` | Hospital Admin |

- **Auth.js credentials sign-in**, scrypt password hashing, 12-hour sessions
  carrying the tenant and role. Unknown email and wrong password are
  indistinguishable, and both burn the same CPU time.
- **Server-side authorization** — `src/server/context.ts` builds the actor from
  the session and the database; the proxy only decides whether to show the
  sign-in page.
- **Doctor Command Center** at `/doctor` — live queue, today's schedule,
  patient flow, daily brief with Start My Day, and metrics with count-up.
- **Data layer** — 41-table Prisma schema on PostgreSQL with a seeded demo
  organisation (100 patients, 297 visits, a live queue).

**Part 1 — project setup, design system, app shell. Complete.**

What exists today:

- **Design system** — the AADRIQUE token set (warm white, deep navy, orange
  accent, charcoal) in light and dark, a display/body/mono type scale with
  tabular figures, and a component layer built on Radix. Browse it at
  [`/design`](http://localhost:3000/design).
- **App shell** — collapsible navy sidebar, command-center header with
  greeting, live date and online status, priority notification center, AI
  Copilot dock, account menu, and a tablet/mobile navigation sheet.
- **Command palette** — `⌘K` / `Ctrl K` from any screen, with quick actions,
  navigation, workspace switching and appearance.
- **Keyboard layer** — `g` then a section key to navigate, `?` for the
  shortcut reference.
- **Operational Pulse** — permanent OPD health indicator in the chrome.
- **All 29 routes** across the doctor, front-desk and admin workspaces, each
  naming the workflow it will hold and the part that delivers it.

Everything clinical is scaffolded, not stubbed with fake data: nav counters and
the notification tray are the only placeholder data, and they are isolated in
`src/lib/shell-demo.ts`.

### Next

The build parts are complete. What remains is front-desk depth (walk-in
registration, the reception queue console), patient-facing surfaces, and
hardening the deployment: a shared-store rate limiter, a nonce-based CSP, and
real integration credentials.

---

## Layout

```
src/
  app/
    (dashboard)/        every workspace route, rendered inside the shell
      doctor/           home, queue, appointments, patients, consultations,
                        follow-ups, messages, analytics, copilot, profile
      reception/        front desk, queue, appointments, patients, notifications
      admin/            overview, doctors, departments, operations, reports,
                        audit, communications, AI, integrations, settings
      design/           design system reference
    globals.css         design tokens and base layer
  components/
    ui/                 primitives — button, card, badge, status, command, …
    shell/              sidebar, topbar, command palette, copilot dock, …
  hooks/                global shortcuts, mounted guard
  lib/                  nav config, session, sidebar store, utils
  types/                shell-level domain types
```

    (auth)/             sign-in
  server/
    context.ts          builds the authorized actor from the session
    services/           all database access lives behind these —
                        appointments, follow-ups, communication, analytics,
                        audit, queue, consultation, patients, dashboard
  lib/
    ai/                 provider abstraction — Claude, and the grounded
                        fallback that needs no credentials
    integrations/       connect / healthCheck / sync adapters per system
    security/           rate limiting
    workflow/           the automation step vocabulary
    auth/               Auth.js config, password hashing
    db/                 Prisma client singleton
    messaging/          WhatsApp / SMS / email provider abstraction
    permissions/        role matrix, tenant + permission assertions
  proxy.ts              redirects unauthenticated users to sign-in
prisma/
  schema.prisma         41 models
  seed.ts               the demo dataset

---

## Conventions

Architecture, AI safety and design rules are in [`AGENTS.md`](./AGENTS.md).
