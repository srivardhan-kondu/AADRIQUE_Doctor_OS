# Patient portal and waiting-room display

What patients see. None of these pages ever show a patient's name to anyone
else — public screens show token numbers only.

---

## Patient portal

**Address:** `/portal/aadrique-medical-center` (each clinic has its own:
`/portal/<clinic>`). Built for phones.

**Test patient:** Lakshmi Iyer, mobile `98765 00101` (more in the
[logins table](./README.md#test-patients-for-the-patient-portal)).

### Signing in

1. **Your mobile number** — the one given to the clinic → **Send code**.
2. A six-digit code is sent by SMS. **On the demo** it is shown on screen
   ("Demo: no SMS gateway is connected, so your code is …").
3. **Six-digit code** → **Sign in**. The code works once, for 10 minutes;
   after five wrong tries a new code is needed.
4. If more than one person is registered with the number (a family), choose
   **Who is this for?**

The portal never says whether a number is registered, so it cannot be used to
look people up.

### What a patient can do

- **Your token today** — if they are in the queue: their token, the current
  token, how many are ahead, the estimated wait. **Follow the queue** opens the
  live token page.
- **Your appointments** — *Upcoming* appointments with **Cancel** (asks **Yes,
  cancel** / **Keep**).
- **Book an appointment** — choose the **Doctor**, **Day** and **Time** from
  the doctor's real open slots, add a reason ("Cough for a week") → **Book**.
  "No free times that day" means try another day.
- **Follow-ups** — when the doctor wants to see them again.
- **Past visits**, and **How was your visit?** — a 1–5 star rating with an
  optional comment, once per visit.
- **Sign out**.

## Live token page

A link sent with the token SMS (or copied by the front desk). It shows the
patient's **token**, the **current token**, how many are **ahead of you** and
the **estimated wait**, and updates itself. If the doctor pauses: "The doctor
is on a short break. Your place is kept." The link is signed, so it cannot be
guessed or changed to see someone else's token.

## Waiting-room display (TV)

**Address:** `/display` — open it on the waiting-area TV while signed in as
front desk (or admin).

For each doctor: **Now serving**, **Next**, and the tokens **Waiting**, with
"Waiting times are estimates. Emergencies are seen first." A paused doctor
shows *On a short break*. It updates by itself — leave it open full-screen
(browser full-screen: `F11` on Windows, `⌃⌘F` on Mac).
