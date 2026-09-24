# Client demo guide

A 20–25 minute walkthrough of AADRIQUE Doctor OS (the full manual is the
[user guide](./user-guide/README.md)), built around one patient
the demo data prepares for you. `e2e/demo-story.spec.ts` rehearses the same
story, so if that test passes, the demo works.

## Before the demo

**Reseed the morning of the demo.** Today's queues, arrivals and "waiting 14
minutes" are generated for the day the seed runs; yesterday's seed shows
yesterday's clinic.

```bash
DATABASE_URL="<neon pooled url>" DIRECT_DATABASE_URL="<neon direct url>" npm run db:seed
```

**Demo deployment settings** (Vercel → Environment Variables, then redeploy).
Only for a demo deployment, never a real clinic:

| Setting | Why |
|---|---|
| `DEMO_MODE=true` | The sign-in page lists the demo accounts — one click to switch role |
| `PORTAL_DEMO_CODES=true` | The patient portal shows the sign-in code on screen, since no SMS gateway is connected |
| `TZ=Asia/Kolkata` | "Today" is Indian time |

**Open these before the client joins** (separate browser profiles, or one
normal and one private window per role, so the sign-ins don't collide):

| Window | Sign in as | Page |
|---|---|---|
| Front desk | `frontdesk@aadrique.demo` (Arjun Menon) | `/reception` |
| Nurse | `nurse@aadrique.demo` (Kavitha Nair) | `/nurse` |
| Doctor | `ananya.rao@aadrique.demo` (Dr. Ananya Rao) | `/doctor` |
| Admin | `admin@aadrique.demo` (Sneha Reddy) | `/admin` |
| Waiting-room TV | front desk | `/display` |
| Phone | — | `/portal/aadrique-medical-center` |

Password for every demo account: `aadrique123`.

## The patient: Lakshmi Iyer (P-000101)

58, type 2 diabetes since 2019, hypertension since 2021, **allergic to
penicillins** (critical) and sulfonamides. Four visits with Dr. Rao over nine
months show her sugar coming down: HbA1c 8.4 → 7.6 → 7.1%. Burning feet
three months ago (early neuropathy, pregabalin); high LDL a month ago
(atorvastatin started). Her **new HbA1c (6.9%) arrived two days ago and is
waiting for Dr. Rao's review.** She replied to yesterday's WhatsApp reminder
asking whether to come fasting — unread.

Today she is back for that follow-up: checked in, **first in Dr. Rao's
line, vitals not yet taken.** Mobile: `98765 00101`.

The rest of the clinic is busy around her: five doctors, 100 patients, a
year of visits, live queues with priority patients, today's appointments,
follow-ups, messages and reports.

## The story

### 1. Front desk — the clinic's morning (3 min)

*Front desk window, `/reception`.*

- Today at a glance: arrivals, who is waiting, every doctor's queue on one
  screen, wait times turning red past the limit.
- **Register a walk-in** — a new patient in under a minute, and a token is
  issued. Point at the TV: the waiting-room display picks it up by itself.
- Search is instant: type a name, a phone number or a patient ID.
- The front desk sees who is here, never what is wrong with them — clinical
  details are withheld by the server, not just hidden.

> *"Reception runs the queue for every doctor from one screen, and the
> patient gets their token on SMS/WhatsApp automatically."*

### 2. Nurse — vitals before the doctor (2 min)

*Nurse window, `/nurse`.*

- Everyone still to be measured is at the top; Lakshmi is first.
- **Record vitals** → BP 146/92, pulse 84, weight 73.8 → Save. It says
  *High BP* straight away — abnormal readings are flagged, mistyped ones
  (a temperature of 370) are refused.
- She moves to *Measured*; the doctor will see these in a moment.

### 3. Doctor — one click to the next patient (8 min)

*Doctor window, `/doctor`.*

- The Command Center: today's queue, who has waited longest, OPD health.
- **Call next** → Lakshmi's consultation opens. Walk the left panel: the
  red **penicillin allergy** first, her conditions, today's vitals from the
  nurse.
- The **pre-consultation brief** (marked AI): her story in a few lines —
  sugars improving, statin started, new HbA1c pending — each line citing the
  record it came from. AI summarises and drafts; it never diagnoses, and
  nothing it writes enters the record without the doctor.
- **History tab**: her last four visits without leaving the page.
- **Medications tab → Add medicine → type "Amoxicillin"** → a red warning:
  *Recorded allergy: Penicillins.* Remove it; add *Azithromycin 500 mg* or
  her usual *Metformin 500 mg* instead. It saves as you type.
- Write an assessment ("HbA1c 6.9%, improving. Continue.") and **Sign**. The
  note and the prescription lock together; **Print** gives the prescription
  with the doctor's registration number.

> *"The doctor never hunts for anything: allergies, history, labs and today's
> vitals are on one screen, and prescribing a drug she is allergic to is
> caught before it is signed."*

### 4. Doctor — the whole patient (3 min)

- **Patient 360** (click her name): one timeline of every visit,
  prescription, report and message.
- **Reports & documents**: the new HbA1c is *Awaiting review* — open the PDF,
  then **Mark reviewed**. Upload a scan to show how a report a patient brings
  is added.
- **Messages**: her unread WhatsApp — *"Should I come fasting?"* — sits in
  the inbox with the rest of her conversation.
- **Follow-ups**: who is due and who is overdue.

### 5. The patient's side (3 min)

*Phone, `/portal/aadrique-medical-center`.*

- Mobile `98765 00101` → **Send code** → the code appears on screen (demo
  only; in production it arrives by SMS) → Sign in.
- Her appointments, **book** a new slot from the doctor's real availability,
  cancel, follow her token live, rate her visit.
- The TV display and her token page show **token numbers only**, never names.

### 6. Admin — running the clinic (4 min)

*Admin window, `/admin`.*

- **Reports / Operations**: visits, no-shows, waiting times, doctor load.
- **Communications → Workflows**: the automations, as editable rules —
  "confirm on booking, remind 24 h before, ask for feedback 2 h after". Open
  one and show it is a readable list of steps, not code.
- **Templates**: the messages patients receive, editable.
- **Staff**: add a user — they get a one-time password and must choose
  their own; reset a password and their session ends immediately.
- **Audit Log**: every sign-in, signature, export and document opened.
- **Patients → Lakshmi → Export data**: her complete record as a file — the
  DPDP right of access. (*Erase identity* exists too; don't click it in the
  demo.)
- **Integrations**: WhatsApp, SMS, email, lab — with live status.

## Questions clients ask

| Question | Answer |
|---|---|
| Does it really send WhatsApp/SMS? | Yes, once the clinic's WhatsApp Business (Meta), MSG91 and email accounts are connected. In the demo messages are simulated and labelled so. |
| Which AI is it? | Claude when a key is configured. Without one, a built-in grounded mode composes the same summaries from the records. The screen says which answered. |
| Can the AI make mistakes in the record? | It cannot write to the record. Everything it produces waits for the doctor, and it only cites records that exist. |
| Where is the data? | Postgres in Singapore (Neon); deployable to an Indian region on request. Encrypted in transit; two-factor sign-in available; every access audited. |
| Patient privacy law? | DPDP: patients' data can be exported on request, identity erased while the medical record is retained as the law requires, consent per channel. |
| Multiple branches? | The data model has facilities; per-branch screens and reports are the next phase. |
| Does it work on a phone/tablet? | Yes — every screen is responsive; the portal is built for phones. |

## After the demo

Reseed to put everything back (step 1 above). Anything you clicked — signed
consultations, registered patients, Lakshmi's reviewed report — is reset.
