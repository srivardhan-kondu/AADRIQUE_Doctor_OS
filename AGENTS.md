<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:aadrique-project-rules -->

# AADRIQUE Doctor OS

The master product specification is `../AADRIQUE_Doctor_OS_Build_Spec.md`. Section
references in code comments (`spec §12`) point at it. Read the relevant section
before implementing a feature.

## Build parts

| Part | Scope | Status |
|------|-------|--------|
| 1 | Project setup, design system, app shell | Done |
| 2a | Prisma schema, RBAC, tenancy, demo seed | Done |
| 2b | Auth.js sign-in, service layer, Doctor Command Center | Done |
| 2c | Patients + Patient 360, queue actions, consultation workspace | Done |
| 3 | Appointments, follow-ups, communication centre, analytics, audit UI | Done |
| 4 | AI abstraction, pre-consultation brief, documentation copilot, history retrieval | Next |
| 5 | Workflow engine, integrations, admin, testing, performance, security review | Planned |

## Architecture rules

- Data flow is **UI → application service → repository → database**. Never call
  Prisma directly from a component.
- Business logic lives in `src/server/`, not in UI components.
- Every protected route enforces authorization **server-side**. Hiding an
  element in the client is never the control (spec §21).
- Every business record carries tenant context. Never query across
  organisations (spec §22).
- Validate all external input with Zod.
- Multi-write workflows go in a transaction, with `TX_OPTIONS` — the hosted
  database is far enough away that Prisma's default 5s interactive-transaction
  timeout aborts normal work.
- No `any` without a comment explaining why.

## Communication rules (spec §14)

- Provider calls go through `src/lib/messaging/`. Never import a gateway SDK
  from a component, a route handler or a service.
- Check consent before writing anything. A patient who has not opted into a
  channel is not messaged on it, and the error names the channels they did
  agree to.
- A send is deliberately not one transaction: write the row, call the gateway
  outside any transaction, then write the receipt back. A network call must
  never hold a transaction open, and a crash mid-send must leave a retryable
  record rather than a silent loss.
- A message that still contains a `{{placeholder}}` is never sent.

## Analytics rules (spec §16)

- Every rate has an explicit denominator and returns `null` when it is zero.
  "0%" and "nothing happened yet" are different facts.
- One primary trend chart per screen, then compact metric cards. Charts are
  single-series or single-hue; status colour is reserved for status and always
  ships with a label, never colour alone.

## AI rules (spec §10)

- AI summarizes, drafts, retrieves and organizes. It never diagnoses, never
  writes to a finalized clinical record and never sends a medical instruction
  without explicit doctor approval.
- Every AI-generated surface is visually marked — use `<Badge variant="ai">`
  and the `.ai-surface` class.
- Provider calls go through the abstraction in `src/lib/ai/`. Never call a
  provider SDK from a component or a route handler directly.

## Design system

- Tokens live in `src/app/globals.css`. Use semantic classes (`bg-card`,
  `text-muted-foreground`), not raw palette scales, in feature code.
- Orange is an accent, navy carries structure, warm white carries surface.
- Status colour has one vocabulary: `src/components/ui/status.tsx`.
- Skeletons match the real layout; empty states say something useful.

## Checks before finishing a feature

```bash
npm run typecheck
npx eslint .
npm test
npm run build
```

## Database

```bash
npm run db:migrate   # create and apply a migration
npm run db:seed      # reset and reseed the demo organisation
npm run db:studio    # browse the data
```

Migrations use `DIRECT_DATABASE_URL` (Neon's direct endpoint); the app connects
over the pooled `DATABASE_URL`.

<!-- END:aadrique-project-rules -->
