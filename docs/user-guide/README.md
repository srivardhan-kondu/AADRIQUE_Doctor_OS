# AADRIQUE Doctor OS — User Guide

AADRIQUE Doctor OS runs a clinic's outpatient department (OPD) in one place:
registration, appointments, the token queue, vitals, consultations,
prescriptions, lab reports, patient messages, follow-ups and reports, with an
AI assistant for the doctor.

This guide is organised by role. Start here for signing in and finding your
way around, then open the page for your role.

| Guide | For |
|---|---|
| [Front desk](./front-desk.md) | Receptionists: registration, walk-ins, booking, the queue |
| [Nurse](./nurse.md) | Nursing staff: the vitals station |
| [Doctor](./doctor.md) | Doctors: queue, consultation, prescriptions, reports, AI Copilot |
| [Administrator](./admin.md) | Hospital admins: doctors, staff, automations, reports, audit, patient data requests |
| [Patient portal and waiting-room display](./patient-portal-and-display.md) | What patients see |
| [Accounts and security](./accounts-and-security.md) | Passwords, forgotten passwords, two-factor sign-in |
| [Troubleshooting](./troubleshooting.md) | Common questions and fixes |

---

## Test logins

The demo organisation is **AADRIQUE Health**, clinic **AADRIQUE Medical
Center**, Hyderabad. **Every demo account uses the password `aadrique123`.**

| Role | Name | Email | Lands on |
|---|---|---|---|
| Hospital admin | Sneha Reddy | `admin@aadrique.demo` | `/admin` |
| Front desk | Arjun Menon | `frontdesk@aadrique.demo` | `/reception` |
| Nurse | Kavitha Nair | `nurse@aadrique.demo` | `/nurse` |
| Doctor — General Medicine | Dr. Ananya Rao | `ananya.rao@aadrique.demo` | `/doctor` |
| Doctor — Cardiology | Dr. Vikram Reddy | `vikram.reddy@aadrique.demo` | `/doctor` |
| Doctor — Pediatrics | Dr. Sneha Menon | `sneha.menon@aadrique.demo` | `/doctor` |
| Doctor — Orthopedics | Dr. Rajesh Naidu | `rajesh.naidu@aadrique.demo` | `/doctor` |
| Doctor — Dermatology | Dr. Karthik Iyer | `karthik.iyer@aadrique.demo` | `/doctor` |

Dr. Ananya Rao is the best doctor account to explore with — the showcase
patient below is in her queue.

### Test patients (for the patient portal)

The portal is at **`/portal/aadrique-medical-center`**. Patients sign in with
their mobile number and a six-digit code. On the demo deployment the code is
shown on screen, because no SMS gateway is connected.

| Patient ID | Name | Mobile | Notes |
|---|---|---|---|
| P-000101 | Lakshmi Iyer | 98765 00101 | Showcase patient: diabetic, penicillin allergy, in Dr. Rao's queue today |
| P-000001 | Prakash Gupta | 98627 55927 | |
| P-000002 | Sushma Mishra | 98507 69255 | Has allergies recorded |
| P-000003 | Manoj Sharma | 98470 59622 | Has allergies recorded |

### About the demo data

- 5 doctors, 100 patients and a year of visit history, so every screen has
  something in it.
- **Today's queues, appointments and wait times are created for the day the
  data is loaded.** If the queues look empty or out of date, the demo data
  needs reloading (see [Troubleshooting](./troubleshooting.md)).
- Messages to patients are **simulated** until the clinic connects WhatsApp,
  SMS and email. They are labelled "simulated" wherever they appear.
- Everything you do in the demo (patients registered, consultations signed)
  is wiped when the demo data is reloaded.

---

## Signing in

1. Open the app's address (for example `https://<your-app>.vercel.app`).
2. Enter your email and password and choose **Sign in**. On the demo, the
   sign-in page also lists the demo accounts — click one to fill it in.
3. You land in your own workspace. What you see depends on your role; what
   you are not allowed to see is not sent to your screen at all.

A new account starts with a **temporary password** from the administrator.
The first sign-in asks you to choose your own before anything else opens.

## Finding your way around

- **Sidebar** (left) — the pages of your workspace. Numbers next to an item
  are live counts (patients waiting, unread messages, follow-ups due).
  Collapse it with the button at its foot.
- **Top bar** — search (`⌘K` / `Ctrl+K`), notifications (bell), the AI
  Copilot (doctors), and your account menu (initials, top right).
- **Account menu** — profile, change password, two-factor sign-in, light or
  dark appearance, sign out.
- **On a phone** — the sidebar becomes a menu button at the top left. Every
  screen works on a phone or tablet.

### Keyboard shortcuts

| Keys | Does |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette: search patients, jump to any page, run actions |
| `?` | Show all shortcuts |
| `Esc` | Close the open dialog or panel |
| `g` then `h` | Home of your workspace |
| `g` then `q` | Queue |
| `g` then `a` | Appointments |
| `g` then `p` | Patients |
| `g` then `c` | Consultations (doctor) |
| `g` then `f` | Follow-ups (doctor) |
| `g` then `m` | Messages (doctor) |

Shortcuts are ignored while you are typing in a field.

### Status colours

Colours always come with a word, so nothing depends on colour alone:

| Label | Means |
|---|---|
| Waiting | Checked in, in the queue |
| Vitals | With the nurse / vitals taken |
| With doctor / In consultation | In the consulting room |
| Completed | Seen |
| No show / Cancelled | Did not come / called off |
| Follow-up | Due back |

### Things that update by themselves

Queues, the vitals station, the front-desk board and the waiting-room display
refresh on their own every few seconds — there is no need to reload. The
small "live" indicator in the page header shows when the page last updated.

## Roles at a glance

| | Front desk | Nurse | Doctor | Admin |
|---|:-:|:-:|:-:|:-:|
| Register and search patients | ✓ | | ✓ | ✓ |
| Book, reschedule, cancel appointments | ✓ | | ✓ | ✓ |
| Issue tokens, run the queue | ✓ | ✓ | ✓ | ✓ |
| Record vitals | | ✓ | ✓ | |
| Read clinical records (notes, allergies, labs) | | ✓ | ✓ | ✓ |
| Write and sign consultations, prescribe | | | ✓ | |
| Upload lab reports and documents | | ✓ | ✓ | |
| Message patients | ✓ | | ✓ | ✓ |
| Reports and analytics | | | ✓ (own) | ✓ |
| Staff, doctors, automations, integrations, audit | | | | ✓ |

The server enforces these. A page you cannot use says so rather than showing
empty data.
