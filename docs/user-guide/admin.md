# Administrator guide

**Test login:** `admin@aadrique.demo` / `aadrique123` (Sneha Reddy, hospital
admin)

Administrators run the clinic but do not practise in it: they can read
clinical records where the job needs it, but cannot write or sign
consultations or prescribe.

Pages (sidebar): **Overview**; *Organisation* — **Doctors**, **Patients**,
**Staff**; *Operations* — **Queue limits**, **Reports**, **Audit Log**;
*Platform* — **Communications**, **AI Assistants**, **Integrations**,
**Settings**.

---

## Overview

How today is running: **Registered today**, **Waiting now**, **With a
doctor**, **Completed** and the **Longest wait**; **What needs attention**
(queues over their limits, consultations running long, messages that failed,
a messaging channel that stopped working), and each department's load
against its limits. For earlier days, use **Reports**.

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

## Queue limits

For each department, a **Wait threshold** (minutes before a wait shows red
and raises an alert) and a **Queue capacity** (how many waiting before the
queue is flagged as busy).

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

### Automatic messages

The messages that go out on their own, each in plain words with an on/off
switch: appointment confirmation and 24-hour reminder, feedback request 2
hours after a visit, follow-up reminder the day before, token notification,
"you're next", and cancellation notice. Switch one off to stop it; messages
already scheduled still go out. If any recently failed, they are listed at
the top with the reason.

**Edit** changes an automatic message's timing or wording.

### Custom automation

For something the standard messages do not cover. A **When** (trigger) and a
list of steps:

Triggers: an appointment is booked / cancelled, a visit is completed, a
consultation is signed, a token is issued, a token is nearly up, a follow-up
is created, a patient is registered.

| Step | Does |
|---|---|
| **Wait** | A fixed time (e.g. 2 hours), or until a moment such as "24 hours before the appointment" |
| **Test** (condition) | Continue only if a *Field* matches a *Value* — e.g. "Appointment status is Scheduled", "Patient agreed to WhatsApp is yes" |
| **Action** | Send a message (template + channel), create a follow-up, create a feedback request, or notify staff |

**In plain words** shows the automation as a sentence. **Save workflow**
refuses one that could never work (a template missing, a field the trigger
does not have) and says why. A new automation starts switched off.

## AI Assistants

- **Clinic documents** — the policies, SOPs and fee schedules doctors can ask
  the assistant about. **Add document** → *Title*, *Category* (optional), and
  the text: paste it, or **Choose a text file** (.txt or .md). It is
  answerable straight away, and each answer points to the passage it came
  from. The bin icon removes a document.
- **Recent activity** — what the assistant produced for doctors (briefs,
  drafts, summaries, answers) and whether the doctor accepted it.

## Integrations

The WhatsApp, SMS and email channels, each with a status (*Connected*, *Needs
attention*, *Disconnected*, *Not configured*). **Check** tests the channel;
status comes from the check, never typed in. On a channel that is not
connected, automatic messages are recorded but not actually sent.

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
4. **Communications** → **Edit** "Feedback request after consultation" →
   read **In plain words**.
5. **Audit Log** — find the password reset you just did.
6. **Patients** → Lakshmi Iyer → **Export data** — open the downloaded file.
