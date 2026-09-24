# Doctor guide

**Test login:** `ananya.rao@aadrique.demo` / `aadrique123` (Dr. Ananya Rao,
General Medicine). Other doctors: see the [logins table](./README.md#test-logins).

Pages (sidebar): **Home** (Command Center), **My Queue**, **Appointments**,
**Patients**, **Consultations**, **Follow-ups**, **Messages**, **Analytics**,
**AI Copilot**. Your profile and clinic hours are in the account menu.

---

## Command Center (home)

Your day on one screen:

- **Patients today**, **Waiting**, **In consultation**, **Completed**,
  **Follow-ups due**.
- **Live Queue** — the current patient and who is next, with wait times.
- **Your day** — today's appointments; **View schedule** for the full list.
- **Patient Flow** — how many are at each stage (waiting, vitals, with
  doctor, completed).
- **Call next** — one click takes the next patient in and opens their
  consultation.

## My Queue

| Action | Does |
|---|---|
| **Call next** | Finishes the current patient (if any) and calls the next one — priority and emergency first, then in order. Opens the consultation. |
| **Complete** | Finishes the current patient without calling another |
| **Vitals** | Sends a waiting patient to the nurse |
| **Mark as no show** | The patient did not answer their call |
| **Pause queue** / **Resume queue** | Step away honestly — the waiting room and the patients' token pages say the doctor is on a short break |

**Patient display** shows what the waiting-area screen is showing for your
queue.

Your status — **Online** or **Away** — shows in the top bar and on the front
desk's board, so reception knows whether to send you walk-ins. Switch it in
**Profile & availability** (account menu).

## The consultation

**Call next** (or open a patient from the queue) opens the consultation
workspace.

### Left panel — the patient at a glance

Name, age, sex, token; **allergies first, in red** (critical ones also as a
banner); chronic conditions; flags; and **today's vitals** from the nurse,
with the time and who took them. **Record vitals** lets you add a reading
yourself.

### The note

Tabs: **Note**, **History**, **Medications**, **Orders**.

The **Note** has *Chief complaint*, *Symptoms*, *History*, *Examination*,
*Assessment* and *Plan*. It **saves as you type** ("Saved" appears in the
header) and survives closing the page or a refresh.

**History** shows previous visits without leaving the page.

### Pre-consultation brief (AI)

Above the note, marked **AI generated** — a short summary of the patient: why
they are here, their recent course, current medicines, recent results and
points worth reviewing. Every line cites the record it came from.

- It is a draft for you to read. It never diagnoses and nothing it writes
  enters the record unless you put it there.
- Rate it **Looks right** or **Not useful** — that feedback is recorded.
- It says which engine answered: *Claude* when an AI key is configured, or the
  built-in grounded mode, which builds the same summary from the records.

### Documentation copilot (AI)

**Draft from dictation**: dictate or paste the consultation in your own
words ("58 year old diabetic, sugars better, HbA1c 6.9…"), choose **Structure
it**, review the draft split into the note's sections, then **Insert into
note**. You can edit everything before signing.

### Prescribing

Open the **Medications** tab.

1. **Add medicine**. Type the name — suggestions come from the medicine
   catalogue (name, strength, form), or type any medicine freely.
2. Fill **dose** ("1 tablet"), **how often** (suggestions: OD, BD, TDS, QID,
   HS, SOS), **days** and **instructions** ("After food").
3. Add up to 20 medicines, and **Advice** for the patient at the bottom.
4. It **saves as you type** ("Prescription saved").

**Allergy warning:** if a medicine matches one of the patient's recorded
allergies, a red banner says *Recorded allergy: …* — check before signing.
The warning matches medicine names against the allergy as recorded, so
allergies are best recorded naming the drugs, e.g. "Penicillins (amoxicillin,
ampicillin)".

### Signing

**Sign consultation** → **Sign**. The assessment is required.

Signing:

- locks the note and issues the prescription together — neither can be
  changed afterwards (make corrections in a new visit);
- completes the visit, so the queue moves on;
- starts the follow-up automations (for example the feedback request two
  hours later).

After signing, the Medications tab shows the issued prescription with
**Print** — a printable prescription with the clinic, your name,
qualifications and registration number, the patient, the medicines, advice
and a signature line. (Your qualifications and registration number are the
ones the administrator entered when adding you.)

## Patients and Patient 360

**Patients** searches by name, mobile, patient ID. Opening one shows
**Patient 360**:

- the profile, contact details, last visit, next follow-up;
- allergies and chronic conditions;
- **At a glance** counts (visits, prescriptions, lab reports, messages);
- the **Timeline** — every visit, prescription, lab report, vital, message,
  appointment and follow-up, newest first, with filters;
- **Reports & documents**.

### Reports and documents

- **Upload** → choose the type (*Lab report*, *Imaging*, *Outside
  prescription*, *Other document*), give the test or document a name, choose
  the file (**PDF, PNG, JPEG or WebP, up to 4 MB**). For a lab report you can
  add key findings and tick *Has abnormal values*.
- Click a document's name to open it in a new tab.
- A lab result shows **Awaiting review** until a doctor chooses **Mark
  reviewed**; abnormal ones are marked *Abnormal*.

## Consultations

Your consultations list — drafts you have not signed yet, and signed ones —
to return to an unfinished note.

## Appointments

Your schedule by **Day** or **Week**, with **Check in**, **Reschedule**,
**Mark as no show** and **Cancel appointment**, and **Book appointment**.

## Follow-ups

Grouped as **Overdue** (should already have come back), **Due today** and
**Upcoming** (next 30 days). On each: **Book the return visit**, **Mark as
done**, or **No longer needed**. Patients are reminded automatically the day
before, if they agreed to messages.

## Messages

The patient inbox: conversations on WhatsApp, SMS and email, including
patients' replies. Filter by channel (WhatsApp, SMS, Email) and search
conversations.

To send: open a conversation, type or **Use a template**, **Send**. You can
only send on channels the patient agreed to — the composer says which. Each
message shows its status: *Pending*, *Queued*, *Sent*, *Delivered*, *Read* or
*Failed* (with the reason).

## AI Copilot

A separate workspace (also from the sparkle button in the top bar):

- **Patient summary** — choose a patient, get a cited summary.
- **Find in history** — ask about a patient's past ("last migraine-related
  visit").
- **Hospital knowledge** — ask about clinic policies from the approved
  documents ("What is the current discharge workflow?").

Everything is marked AI, cites its sources, and waits for your review.

## Analytics

Your own numbers for **7**, **30** or **90 days**: patients seen, average
consultation and wait, completion, no-show and follow-up rates, repeat
patients, patients per day, when your patients arrive, and **patient
feedback** (ratings and comments).

## Profile and clinic hours

Account menu → **Profile & availability**:

- **Qualifications**, **Registration no.**, specialization, experience —
  printed on prescriptions. These are entered by the administrator when your
  account is created; ask them if anything is wrong.
- **Clinic hours** — sessions per weekday with breaks; **Edit hours**, **To
  weekdays** copies Monday to Tuesday–Friday, **Save hours**. Booking offers
  only these times.
- **Consultation slot** length, **Accept walk-ins**, and your **Online /
  Away** status.

---

## Practice run (with the showcase patient)

1. Sign in as Dr. Ananya Rao. (Ideally the nurse records Lakshmi's vitals
   first — see the [nurse guide](./nurse.md#practice-run).)
2. **Call next** → Lakshmi Iyer's consultation opens. Read the red penicillin
   allergy and the AI brief.
3. **History** tab: four visits, HbA1c 8.4 → 7.6 → 7.1.
4. **Medications** → **Add medicine** → type "Amoxicillin" → the allergy
   warning appears. Replace it with "Metformin 500 mg", twice daily, 90 days.
5. **Note** → Assessment: "HbA1c 6.9%, improving. Continue." → **Sign
   consultation** → **Sign**.
6. **Medications** → **Print**.
7. Open her **Patient 360** → **Reports & documents** → open the new HbA1c →
   **Mark reviewed**.
8. **Messages** → her unread question "Should I come fasting…?" → reply.
