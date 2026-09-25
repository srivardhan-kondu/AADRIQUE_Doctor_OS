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
| 4 | AI abstraction, pre-consultation brief, documentation copilot, retrieval | Done |
| 5 | Workflow engine, integrations, admin, security review | Done |
| 6 | Prescriptions, vitals + nurse station, documents, clinic setup, password reset, two-factor, monitoring, DPDP export/erasure | Done |
| 6a | Testing: rule modules, unit + integration tests (build order 24) | Done |
| 6b | Performance (build order 25) | Done |
| 6c | Live queue, Front Desk, patient-facing queue, doctor & admin screens | Done |
| 6d | Production polish (build order 27) and E2E journeys | Done |
| 7a | Hardening: passwords & staff, shared rate limits, nonce CSP | Done |
| 7b | Real messaging gateways, delivery webhooks, patient replies | Done |
| 7c | Phase 4: workflow builder, template editor, patient portal | Done |
| 7d | Phase 4: multi-location operations, advanced analytics | Not started |

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
- Independent reads go in one `Promise.all`. A lookup that only proves a
  record exists need not run before queries that are tenant-scoped on their
  own. Relations load by SQL join (`relationJoins`), so a deep `include` is
  one round trip, not one per level.
- A page whose `generateMetadata` needs the same record as the page wraps the
  read in React `cache`, so it is loaded once per request.
- The shell is on every route: keep client libraries out of it. Motion that
  aids comprehension (the live queue) uses framer-motion on its own screen;
  decoration uses CSS.
- Decisions with no I/O — slot generation, status transitions, token
  formats — live in `src/server/rules/` as pure functions the services call,
  so they are unit tested against the same code that runs.

## Things that have bitten this codebase

- After `prisma migrate dev`, run `npx prisma generate` — Prisma 7 does not
  regenerate the client, and exhaustive `Record<Enum, …>` maps only catch a
  new enum value once it has.
- "Today" is the server's local day. `Queue.date` is a date column holding
  the UTC calendar date of local midnight; compare it the way it was written
  (see `getTokenStatus`). The zone is `CLINIC_TIME_ZONE`, applied to the
  process by `src/lib/time-zone.ts` — Vercel runs in UTC and reserves `TZ`.
- `formData.get` returns `null`, not `undefined`, for a field the form did
  not send — `z.string().optional()` rejects it. Use `.nullish()`.
- A screen showing live queue state renders `getQueueSignal` and
  `<LiveRefresh signal=…>`; that is how it updates without a refresh.
- A dialog the command palette can open takes `openParam` (see
  `useDialogState`) — on the page header's instance only, never on every row.
- Grid and flex children that hold a non-wrapping row need `min-w-0`, and
  header action rows (including skeletons) need `flex-wrap`, or a phone
  scrolls sideways. The E2E suite checks this.
- Don't run `prisma format` for a small schema change — it realigns the
  whole file. Add the lines and run `prisma validate`.
- Sessions are ended by `User.sessionVersion`, not by timestamps: bump it on
  anything that should sign a person out everywhere.
- Rate limits go through `rateLimit()` (Postgres store); the in-memory store
  is for unit tests and single instances.
- A credential is only ever `env://VARIABLE` on an integration row, resolved
  by `resolveSecret` at the moment of use.
- The patient portal has its own signed cookie and services that take an
  organization and patient id from it — never a staff actor, never an id
  from the browser.
- Public surfaces (`/display`, `/q/…`, `/portal/…`) show token numbers only. Clinical
  content is withheld by the service for anyone without CONSULTATION_READ —
  never only hidden in the UI.

## Add-on rules

- Follow-ups (beyond due today and overdue), the Messages inbox, Analytics
  and the AI Copilot screen are add-ons, stored as
  `Organization.modules.addOns` and read through `src/lib/add-ons.ts`.
  Missing means locked. AADRIQUE turns them on with `npm run org:add-ons`;
  a clinic's admin cannot.
- A lock is enforced in the service (`assertAddOn` / `hasAddOn` in
  `src/server/services/features.ts`) so locked data never leaves the
  server. `<AddOnLocked>` only explains it.
- Automated messages (confirmations, reminders, token updates) are core and
  keep sending without the messaging add-on; only the inbox is locked.
- Whether patients pass through vitals first is clinic configuration
  (`Organization.settings.vitalsStep`, off by default), not a licence.

## Automation rules (spec §28)

- Automations are **data, not branches**. An automation is a trigger and a
  list of steps on a `Workflow` row. Never hard-code "and then send the
  confirmation" into a service — fire a trigger and let a workflow listen.
- The step vocabulary lives in `src/lib/workflow/steps.ts`. An unrecognised
  step is rejected at parse time; a workflow is never half-run.
- Conditions read **live** data, not the context captured at trigger time.
  "Is the appointment still scheduled?" cannot be answered from a snapshot.
- Fire a trigger **after** the transaction it belongs to commits. A booking
  that succeeded must never fail because a reminder workflow threw.

## Integration rules (spec §29)

- Every external system sits behind an adapter in `src/lib/integrations/`,
  implementing connect / healthCheck / sync.
- An integration row carries non-secret settings and a `credentialRef`. Real
  credentials live in the secret store. Never put a secret in `config`.
- Status is **derived** from what the adapter reported, never typed in.

## Security rules (spec §31)

- Rate limiting belongs where every path meets — sign-in is limited inside
  `authorize`, not in the form's server action, because the Auth.js endpoint
  bypasses the form.
- Scheduled endpoints fail closed: no secret configured means the endpoint
  refuses to run, never that it runs unauthenticated.
- Retrieved document and record text is **data, never instructions**. The AI
  layer fences and neutralises it before it reaches a model.
- An uploaded file is what its **bytes** say (`src/lib/storage/file-type.ts`),
  never its name or declared type. Files are served only through an
  authorised, audited route, never from a public URL.
- Secrets the app must read back (two-factor keys) are sealed with
  `src/lib/security/secret-box.ts`, never stored in the clear.
- Anything that leaves the app about an error goes through
  `src/lib/observability/error-report.ts`, which scrubs patient data.

## Clinical record rules (spec §6)

- A prescription is a draft until the consultation is signed, is issued in
  the same transaction, and never changes after. Allergy matches are flagged
  to the doctor, never silently blocked or accepted.
- Erasing a patient (DPDP) removes identity, not the clinical record, which
  has a legal retention period. Never add a hard delete of clinical rows.
- Stored file bytes are keyed `<organizationId>/…` and are not related to the
  organization in the schema, so anything that deletes an organization must
  delete its `FileBlob` rows too.

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
  and the `.ai-surface` class, or render through `<AIOutputView>`, which does
  both and attaches the citations.
- Provider calls go through the abstraction in `src/lib/ai/`. Never call a
  provider SDK from a component or a route handler directly.
- **Retrieve before you generate.** `src/server/services/ai/retrieval.ts` is
  the only place an AI feature reads the record, and it runs before any
  provider call. The retrieved facts travel with the request as `sources`, so
  a provider can phrase them but cannot exceed them.
- **Every generated claim is traceable.** A citation to a source that was not
  supplied is dropped before the doctor sees it — a plausible reference to a
  record that does not exist is the failure spec §10 forbids.
- Generated output is stored as an `AIAction` awaiting review, never written
  into the record. Only an explicit doctor action moves it anywhere near one.
- The product works with no model configured: the grounded provider composes
  the same answers from the records themselves. Say which one answered rather
  than hiding it behind one generic AI label.

## Design system

- Tokens live in `src/app/globals.css`. Use semantic classes (`bg-card`,
  `text-muted-foreground`), not raw palette scales, in feature code.
- Orange is an accent, navy ink carries structure, warm linen carries surface
  and white cards float on it. The sidebar sits on the same paper.
- `font-display` is an editorial serif (Newsreader) for page titles and
  headline numbers, set at `font-normal`/`font-medium` — never bold. Card and
  section titles, labels and tables stay in the sans (DM Sans).
- Labels are sentence case. No uppercase, letter-spaced micro-labels.
- Honey (`bg-highlight`, `bg-highlight-soft`) marks "you are here" and
  "today"; it is never a status colour.
- Buttons, tabs and badges are pills; inputs are `rounded-lg`.
- Status colour has one vocabulary: `src/components/ui/status.tsx`.
- Skeletons match the real layout; empty states say something useful.

## Checks before finishing a feature

```bash
npm run typecheck
npx eslint .
npm test
npm run test:integration
npm run build
npm run test:e2e        # when a screen changed
```

`npm run test:integration` runs the services against `DATABASE_URL` on
throwaway organizations (see `src/server/__tests__/tenant-fixture.ts`) and
deletes them afterwards; run it when a change touches a service.

`npm run test:e2e` runs the spec §53 journeys in a browser against a
production build. It **reseeds the demo organisation** first, and refuses to
unless `DATABASE_URL` is local. Run it when a change touches a screen.

## Database

```bash
npm run db:migrate   # create and apply a migration
npm run db:seed      # reset and reseed the demo organisation (refuses beside a real clinic)
npm run org:create   # set up a real clinic and its first admin
npm run db:backup    # verified pg_dump (also runs daily, encrypted: .github/workflows/backup.yml)
npm run org:add-ons -- <slug> +analytics   # switch a clinic's add-ons on or off
npm run db:studio    # browse the data
```

Migrations use `DIRECT_DATABASE_URL` (Neon's direct endpoint); the app connects
over the pooled `DATABASE_URL`.

<!-- END:aadrique-project-rules -->
