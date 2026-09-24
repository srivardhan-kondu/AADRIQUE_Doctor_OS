# Nurse guide

**Test login:** `nurse@aadrique.demo` / `aadrique123` (Kavitha Nair)

Nurses land on the **Vitals Station**: everyone in today's queues who is still
in the building, across all doctors, with the people still to be measured at
the top.

---

## The Vitals Station

The page has two lists:

- **To measure** — patients with no vitals yet today, priority and emergency
  patients first, then by how long they have waited.
- **Measured** — patients whose vitals are in, with the reading, the time and
  who took it.

Each row shows the token, name, patient ID, age, sex, doctor and the reason
for the visit. **Allergies are shown in red** on the row. The status on the
right says whether the patient is *Waiting*, at *Vitals* or already *With
doctor*.

The list updates by itself as the front desk issues tokens and doctors call
patients.

## Recording vitals

1. **Record vitals** on the patient's row.
2. Fill in what you measured and leave the rest empty:

   | Field | Unit | Normal adult range (guide) |
   |---|---|---|
   | BP systolic / diastolic | mmHg | below 140 / 90 |
   | Pulse | bpm | 50 – 100 |
   | Temperature | °C | below 38 |
   | SpO₂ | % | 94 and above |
   | Respiratory rate | /min | up to 24 |
   | Weight | kg | |
   | Height | cm | |
   | Blood glucose | mg/dL | |

3. **Notes** (optional) — "Measured seated, after rest".
4. **Save vitals**.

What happens next:

- The patient moves to **Measured**, their token status becomes *Vitals*, and
  the readings appear in the doctor's consultation panel straight away.
- **Abnormal readings are flagged**, never refused: the confirmation says
  *Fever*, *High BP*, *Low SpO₂*, *Fast pulse* and so on, and the flag shows on
  the row.
- **Mistyped readings are refused** with the expected range — a temperature
  of 370, a pulse of 7, or systolic lower than diastolic.
- Blood pressure needs both numbers.

You can record vitals more than once for the same patient (a repeat BP after
rest); the doctor sees the latest, and all are kept.

## Other things a nurse can do

- **Upload a lab report or document** the patient brought, from the patient's
  page (see [Doctor guide → Reports and documents](./doctor.md#reports-and-documents)).
- **Read the clinical record** needed to prepare the patient (allergies,
  conditions, previous vitals). Nurses cannot write or sign consultations or
  prescribe.

---

## Practice run

1. Sign in as the nurse.
2. **Lakshmi Iyer** (P-000101) is at the top of *To measure*. Note her red
   allergy line.
3. **Record vitals**: BP 146 / 92, pulse 84, weight 73.8 → **Save vitals**.
4. The confirmation says *High BP*; she moves to *Measured*.
5. Sign in as Dr. Ananya Rao (another browser window) and call the next
   patient — her vitals are already in the consultation.
