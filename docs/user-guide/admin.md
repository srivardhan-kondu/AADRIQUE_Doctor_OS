# Administrator guide

**Test login:** `admin@aadrique.demo` / `aadrique123` (Sneha Reddy, hospital
admin)

Administrators run the clinic but do not practise in it: they can read
clinical records where the job needs it, but cannot write or sign
consultations or prescribe.

Pages (sidebar): **Overview**; *Organisation* — **Doctors**, **Departments**,
**Patients**, **Staff**; *Operations* — **Operations**, **Reports**, **Audit
Log**; *Platform* — **Communications**, **AI Assistants**, **Integrations**,
**Settings**.

---

## Overview

Today's health of the clinic: who is **Waiting now**, the **Longest wait**,
OPD volume over 30 days, **Message delivery**, automations, integrations and
doctors, and recent **Activity** (every row is also in the audit log).

## Doctors

- **Add doctor** → *Full name*, *Email*, *Department*, *Token prefix* (the
  letter on their tokens, e.g. `A`), *Specialization*, *Qualifications*
  ("MBBS, MD"), *Registration no.*, *Consultation slot*. Qualifications and
  registration number are printed on every prescription — enter them here,
  as they cannot be changed from the app later.
  **Add** shows a **temporary password** once — **Copy password** and hand it
  over in person. They choose their own at first sign-in.
- **Manage** a doctor → clinic hours (**Set clinic hours**), practice settings
  (slot length, **Accept walk-ins**), today's queue and 30-day numbers.

## Departments

Departments group doctors, queues and appointments. Each has a **Wait
threshold** (minutes before a wait shows red and raises an alert) and a
**Queue capacity** (how many waiting before the queue is flagged as busy).

## Staff

Everyone with access, their role and status.

- **Add staff** → *Full name*, *Email*, *Role*: **Front desk**, **Nurse**,
  **Staff (view only)** or **Administrator**. A temporary password is shown
  once.
- **Manage** (on a row):
  - **Reset password** — issues a new temporary password and **signs the
    person out everywhere immediately**. It also turns off their two-factor
    sign-in, which is how someone who lost their phone gets back in.
  - **Remove access** / restore — their open sessions end at once.
- A staff member who clicks *Forgot password?* when email is not set up
  appears here as a **Password reset requested** notification.

## Patients

The patient directory, with **Export directory** (CSV, audited).

Opening a patient shows Patient 360 plus two data-request tools (India's
DPDP Act, 2023):

- **Export data** — downloads everything held about the patient as a file
  (profile, visits, notes, prescriptions, vitals, reports, messages,
  follow-ups, feedback). Use it when a patient asks for a copy. Audited.
- **Erase identity** — for a patient who asks for their data to be erased.
  Type their patient ID to confirm. Their name, contact details, date of birth
  (age is kept), identifiers, message contents and AI drafts are removed;
  future appointments and reminders are cancelled; they disappear from
  search. **Consultations, prescriptions and reports are kept, de-identified,**
  because medical records must be retained by law. **This cannot be undone** —
  export first if they asked for a copy.

## Operations

What needs attention right now: department load against capacity, patients
**Registered today**, **With a doctor**, **Completed**, and alerts for queues
past their limits.

## Reports

For the chosen period: **OPD volume**, **Avg wait**, **Appointment
conversion**, **Cancellation rate**, **No-show rate**, **Follow-up
completion**, OPD volume per day, **Doctor utilisation**, **Department
volume** and **Peak hours** (when consultations actually start).

A rate with nothing to measure yet shows "—", not "0%".

## Audit Log

Every sign-in, signature, prescription issued, record opened or exported,
document viewed, password reset and setting changed — who, what, when. Newest
first, filterable. Nothing clinical is written into the log itself.

## Communications

### Message templates

The messages patients receive. **New template** or **Edit**:

- *Name*, *Key*, *Channel* (WhatsApp, SMS, Email), *Kind* (*About their care*
  or *Engagement*), *Language*, *Subject* (email).
- **Message** — write the text; **Insert a detail** adds placeholders such as
  `{{patientName}}`, `{{doctorName}}`, `{{appointmentTime}}`, `{{token}}`.
- **What the patient reads** previews it with sample details.
- A message that still has an unfilled placeholder is never sent.

For SMS in India each template needs its DLT-approved flow id; for WhatsApp,
approved templates are needed outside the 24-hour reply window.

### Automations (workflows)

Automations are rules, not code: a **When** (trigger) and a list of steps.

Triggers: an appointment is booked / cancelled, a visit is completed, a
consultation is signed, a token is issued, a token is nearly up, a follow-up
is created, a patient is registered.

Steps:

| Step | Does |
|---|---|
| **Wait** | A fixed time (e.g. 2 hours), or until a moment such as "24 hours before the appointment" |
| **Test** (condition) | Continue only if a *Field* matches a *Value* — e.g. "Appointment status is Scheduled", "Patient agreed to WhatsApp is yes" |
| **Action** | Send a message (template + channel), create a follow-up, create a feedback request, or notify staff |

**Run what is due** (Communications page) resumes waiting automations now;
normally a scheduled job does this every few minutes.

**In plain words** shows the workflow as a sentence. **Save workflow** refuses
a workflow that could never work (a template missing, a field the trigger does
not have) and says why. **Recent runs** shows what each automation did.

The demo comes with: appointment confirmation and 24-hour reminder, feedback
request 2 hours after a visit, follow-up reminder the day before, token
notification, "you're next", and cancellation notice.

## AI Assistants

What the AI has produced — briefs, drafts, summaries, answers — with counts
**Awaiting review**, **Accepted**, **Dismissed**, **Failed**, and the
**Knowledge base**: the approved hospital documents the assistant can quote.

## Integrations

WhatsApp, SMS, email, lab, pharmacy and hospital systems, each with a status
(*Connected*, *Needs attention*, *Disconnected*, *Not configured*). **Check**
runs a health check; **Sync** pulls data where the system supports it. Status
comes from the check, never typed in.

To connect messaging, the credential goes in the server's environment and the
integration names it as `env://VARIABLE_NAME` — see the main
[README → Connecting messaging](../../README.md#connecting-messaging).

## Settings

Organisation details, **Facilities**, the **Patient portal** address,
**Roles and permissions** and **Queue limits**.

---

## Practice run

1. Sign in as the admin.
2. **Staff** → **Add staff** → "Test Nurse", `test.nurse@example.com`,
   *Nurse* → copy the temporary password. Sign in as them in a private
   window: they must choose a new password first.
3. Back as admin → **Manage** → **Reset password** — the private window is
   signed out on its next click.
4. **Communications** → open "Feedback request after consultation" → read
   **In plain words**.
5. **Audit Log** — find the password reset you just did.
6. **Patients** → Lakshmi Iyer → **Export data** — open the downloaded file.
