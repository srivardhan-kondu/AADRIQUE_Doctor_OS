# Troubleshooting and FAQ

## Signing in

**"That email and password do not match an account."**
Check the email, and that Caps Lock is off. Demo password: `aadrique123`.
After several wrong tries sign-in is paused for a few minutes ("Too many
sign-in attempts") — wait, then try again.

**It asks for an "Authenticator code" I don't have.**
Two-factor is on for this account. Use the authenticator app on your phone. If
the phone is lost, an administrator resets your password (which turns
two-factor off).

**"You were signed out because your password or your access changed."**
Your password was reset or changed elsewhere, or your access was removed. Sign
in again with the new password.

**I am sent to "Choose your password" every time.**
You still have a temporary password. Choose your own; the page won't let you
go anywhere else until you do.

## Demo data

**Today's queues are empty / show yesterday's patients.**
The demo's "today" is the day the data was loaded. Reload it (whoever manages
the deployment runs this from the project folder):

```bash
set -a; . ./.env.neon; set +a
DATABASE_URL="$NEON_SG_DATABASE_URL" DIRECT_DATABASE_URL="$NEON_SG_DIRECT_DATABASE_URL" npm run db:seed
```

This also undoes everything done during a demo.

**The sign-in page doesn't list the demo accounts.**
The deployment needs `DEMO_MODE=true`. Type the email and password instead.

**The patient portal doesn't show the code on screen.**
The deployment needs `PORTAL_DEMO_CODES=true` (demo only). On a real
deployment the code arrives by SMS.

## Queue

**"Call next" called someone other than I expected.**
Priority and emergency patients are always called first, then in order of
arrival. Check the queue for a *Priority* badge.

**The queue is paused.**
**Resume queue** on My Queue. While paused, the waiting room and patients'
token pages say the doctor is on a short break.

**A patient is not in the queue.**
They are booked but not checked in. Front desk → **Arrivals** → **Check in**,
or issue a **Walk-in** token.

## Consultations and prescriptions

**I can't edit a consultation.**
It is signed. Signed notes and issued prescriptions cannot change — record
anything new in a new visit.

**No allergy warning appeared.**
The warning matches the medicine's name against the allergy as recorded.
"Penicillin" does not match "Amoxicillin"; record the allergy with the drugs
named, e.g. "Penicillins (amoxicillin, ampicillin)".

**The printed prescription has no registration number.**
It is taken from what the administrator entered when adding the doctor. It
cannot yet be edited in the app afterwards; the administrator can have it
corrected in the database.

## Documents

**"Only PDF, PNG, JPEG and WebP files can be uploaded."**
The file's contents are checked, not its name. Save or scan as PDF or JPEG.

**"The file is larger than 4 MB."**
Scan at a lower resolution, or save as PDF.

## Messages

**Messages say "simulated".**
No real gateway is connected for that channel yet. An administrator connects
WhatsApp, SMS and email under **Integrations**; until then nothing actually
leaves the system.

**"The patient has not agreed to …"**
Patients are only messaged on channels they agreed to, which is recorded at
registration. Changing a patient's consent afterwards is not yet possible in
the app — message them on a channel they did agree to (the composer lists
them).

**A message failed.**
Its status shows the reason (for example a wrong number or a template the
gateway refused). Fix the cause and send again.

## Reports

**A rate shows "—" instead of a number.**
Nothing has happened yet to measure it (for example no appointments in the
period). "0%" would mean something did happen, and none of it counted.

## Still stuck?

Note the time and what you clicked, and tell the administrator — every action
is in the audit log, and server errors are logged with the time, which makes
problems quick to trace.
