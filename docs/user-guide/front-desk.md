# Front desk guide

**Test login:** `frontdesk@aadrique.demo` / `aadrique123` (Arjun Menon)

The front desk registers patients, books appointments, checks people in,
issues tokens and keeps every doctor's queue moving. It sees who is in the
building, not what is wrong with them: clinical notes, allergies and lab
results are not shown to the front desk.

Pages (sidebar): **Front Desk**, **Today's Queue**, **Appointments**,
**Patients**, **Notifications**.

---

## Front Desk (home)

Your morning at a glance:

- **Doctors** — each doctor's status: *On duty* (online), *Away* or *Paused*, who is
  *In the room*, how many are *Waiting*, and the average wait.
- **Arrivals** — today's booked patients: *Expected*, *Running late*, *In the
  building*. Choose **Check in** as each one arrives; they get a token and
  join their doctor's queue.
- **Search** — type a name, mobile number, patient ID or appointment ID. If
  the person is not found, the result offers **Register patient**.

The buttons at the top — **Register patient**, **Walk-in**, **Book** — are
also available from the command palette (`⌘K`).

## Registering a new patient

1. **Register patient**.
2. Required: **First name**, **Sex**, **Mobile number**, and age or date of
   birth. Everything else can wait.
3. **May we message them?** — tick the channels the patient agrees to:
   *WhatsApp*, *SMS*, *Email*. The system will never message a patient on a
   channel they have not agreed to.
4. **More details** opens address, city, emergency contact and preferred
   language (English, Hindi, Telugu, Tamil, Kannada, Malayalam).
5. **Register**. The patient gets a patient ID (for example `P-000102`).

Tip: search before registering. A family often shares one mobile number;
that is fine — each person gets their own record.

## Walk-ins: issuing a token

1. **Walk-in** (top of the page).
2. Find the patient, or **Register a new patient** from inside the dialog.
3. **Choose a doctor**, add the reason ("Fever since yesterday").
4. **Priority**: *Normal*, *Priority* (elderly, pregnant, disabled) or
   *Emergency*. Priority and emergency patients are called before others.
5. **Issue token**. The token (for example `A025`) is shown, and — if the
   patient agreed — sent to them by SMS with their place in the line.

**Copy the patient's live token link** gives a link the patient can open on
their phone to follow their place in the queue.

## Booking an appointment

1. **Book** (or **Book appointment** on the Appointments page).
2. Choose the patient, the **Doctor**, the **Date** and the **Type**: *New
   consultation*, *Follow-up*, *Procedure*, *Teleconsultation*.
3. Open slots are shown from the doctor's clinic hours; taken or past slots
   are not offered. "No clinic hours on this day" means the doctor does not
   sit that day — pick another date.
4. Add a reason (optional) and **Book**. If the patient agreed to WhatsApp,
   a confirmation goes out, and a reminder 24 hours before.

## Appointments page

A **Day** or **Week** view per doctor. On each appointment:

| Action | When |
|---|---|
| **Check in** | The patient has arrived — issues their token |
| **Reschedule** | Move to a new date and time (*Move appointment*) |
| **Mark as no show** | They did not come |
| **Cancel appointment** | Called off; add an optional reason. The patient is told if they agreed to messages |

"Outside clinic hours" lists appointments booked before the doctor's hours
changed, so none are lost.

## Today's Queue

Every doctor's queue on one screen:

- Each board shows *Now serving*, who is next, and everyone waiting with
  their wait time — **red** means past the department's wait limit.
- **Waiting-room display** opens the TV screen for the waiting area in a new
  tab (see [Patient portal and display](./patient-portal-and-display.md)).
- **Walk-in** issues a token without leaving the page.

## Patients

Search the whole patient list. Opening a patient shows their profile,
contact details, visits and appointments (without clinical detail) with
**Book** and **Walk-in** actions.

## Notifications

Alerts for the desk — a queue past its limit, a doctor who paused, a staff
password-reset request. Filter by **All** or **Unread**; clicking one takes
you to the right page.

---

## A typical morning (practice run)

1. Sign in as the front desk.
2. Check in two *Expected* patients from **Arrivals**.
3. **Register patient**: "Meera Joshi", female, 34, mobile `98480 12345`,
   WhatsApp ✓.
4. **Walk-in** for Meera with Dr. Ananya Rao, reason "Headache", *Normal*.
5. Open **Today's Queue** and find her token at the end of Dr. Rao's line.
6. Open **Waiting-room display** — her token appears under *Waiting*.
