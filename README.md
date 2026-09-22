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

Part 3: the appointment module, follow-up queue, communication centre with the
WhatsApp/SMS/email abstraction, analytics, and the audit log UI.

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
    services/           all database access lives behind these
  lib/
    auth/               Auth.js config, password hashing
    db/                 Prisma client singleton
    permissions/        role matrix, tenant + permission assertions
  proxy.ts              redirects unauthenticated users to sign-in
prisma/
  schema.prisma         41 models
  seed.ts               the demo dataset

---

## Conventions

Architecture, AI safety and design rules are in [`AGENTS.md`](./AGENTS.md).
