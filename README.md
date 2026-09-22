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

Part 2 brings the Prisma schema, Auth.js authentication, RBAC, tenant isolation,
the Doctor Command Center with a live queue, the patient module, appointments
and the consultation workspace. It needs a PostgreSQL connection string in
`.env` as `DATABASE_URL`.

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

Arriving in Part 2: `src/server/` (services, repositories, workflows),
`prisma/schema.prisma`, and `src/lib/{auth,db,permissions,validation}`.

---

## Conventions

Architecture, AI safety and design rules are in [`AGENTS.md`](./AGENTS.md).
