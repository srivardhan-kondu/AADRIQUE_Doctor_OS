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

Open <http://localhost:3000> and sign in with a demo account — the sign-in
page lists them (password `aadrique123`). Each role lands in its own
workspace: doctors in `/doctor`, the front desk in `/reception`,
administrators in `/admin`.

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

### Deploying

- Host the app in the same region as its database.
- `AUTH_SECRET` and, outside Vercel, `AUTH_TRUST_HOST=true`.
- `TZ` set to the clinic's time zone — "today" is the server's local day.
- `APP_URL`, so token messages can carry the patient's live token link.
- `CRON_SECRET`, and a scheduler calling `POST /api/jobs/workflows`.

---

## What it does

- **Doctor** — Command Center with the live queue and one-click Call Next;
  the consultation workspace with autosaving drafts and signing; Patient 360;
  consultations worklist; schedule; follow-ups; messages; analytics; the AI
  Copilot (pre-consultation brief, note drafting, history search), always
  marked as AI and never writing to a signed record; a profile with clinic
  hours and an on-duty switch.
- **Front desk** — registration, instant search, walk-in tokens with
  priority, booking for any doctor, today's arrivals and check-in, every
  doctor's queue on one screen, notifications.
- **Patients** — a waiting-room display (`/display`) and a personal live
  token page from a signed link. Token numbers only, never names.
- **Admin** — doctors (add, department, clinic hours), departments, patient
  directory with audited export, operations, reports, audit log,
  communication templates and workflows, AI activity, integrations, roles.
- **Throughout** — queues update without a refresh; permissions and tenant
  boundaries are enforced on the server; every important action is audited;
  automations are data (spec §28), not code.

### Not built yet

Real messaging gateways (every channel uses a simulated provider until one is
connected), a shared-store rate limiter and a nonce-based CSP for
multi-instance production, password change and reset, and the spec's
Phase 4 items (patient portal, multi-location operations).

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
    display/            the waiting-room screen
    q/[code]/           a patient's live token page (signed link)
    globals.css         design tokens and base layer
  components/
    ui/                 primitives — button, card, badge, status, command, …
    shell/              sidebar, topbar, command palette, live refresh, …
    reception/          registration, walk-ins, arrivals, facility queue
    doctors/            clinic-hours editor, practice settings
  hooks/                global shortcuts, dialog state, mounted guard
  lib/                  nav config, session, sidebar store, utils
  types/                shell-level domain types
```

    (auth)/             sign-in
  server/
    context.ts          builds the authorized actor from the session
    rules/              pure, unit-tested decisions — slots, lifecycle,
                        queue order, clinic hours
    services/           all database access lives behind these
  lib/
    ai/                 provider abstraction — Claude, and the grounded
                        fallback that needs no credentials
    integrations/       connect / healthCheck / sync adapters per system
    security/           rate limiting, signed patient links
    workflow/           the automation step vocabulary
    auth/               Auth.js config, password hashing
    db/                 Prisma client singleton
    messaging/          WhatsApp / SMS / email provider abstraction
    permissions/        role matrix, tenant + permission assertions
  proxy.ts              redirects unauthenticated users to sign-in
prisma/
  schema.prisma         41 models
  seed.ts               the demo dataset
e2e/                    browser journeys (Playwright)

---

## Conventions

Architecture, AI safety and design rules are in [`AGENTS.md`](./AGENTS.md).
