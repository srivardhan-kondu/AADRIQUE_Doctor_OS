# AADRIQUE Doctor OS
## Product Requirements + Build Specification for a Next.js Healthcare Platform

> **Working product concept:** AADRIQUE Doctor OS  
> **Positioning:** A premium, doctor-first operating system for OPD, patient management, communication, AI-assisted workflows, and hospital integrations.  
> **Primary build target:** Next.js web application, designed to feel like a modern clinical command center rather than a traditional hospital management system.

---

# 1. Product Vision

AADRIQUE currently presents a modular healthcare technology platform focused on OPD and patient management, patient communication, AI assistants, and integrations with existing hospital systems. The brochure specifically describes patient registration and token management, appointments, doctor dashboards, visit history, analytics, WhatsApp/SMS notifications, follow-up automation, feedback/review automation, AI enquiry/appointment/voice assistants, and integrations with HMS/EMR, lab systems, pharmacy, WhatsApp/SMS, email, and other APIs. These are the core product capabilities this application should turn into a real, cohesive product experience.

**The opportunity:** do not build another CRUD-heavy hospital dashboard.

Build something that makes a doctor think:

> **“This is the first hospital software that actually understands how I work.”**

The product should optimize for:

- Extremely fast daily doctor workflows
- Minimal clicks during consultation
- A beautiful, calm clinical interface
- Patient context available instantly
- AI that removes repetitive work without taking clinical control away from the doctor
- Real-time OPD visibility
- Smart communication automation
- Modular architecture so a clinic can start small and expand
- Demo experiences that look impressive within 30 seconds

---

# 2. Product Goals

## Primary goal

Create a doctor-first healthcare operations platform that combines:

1. OPD workflow
2. Patient records
3. Appointments
4. Queue/token management
5. Consultation workspace
6. Communication automation
7. AI assistants
8. Analytics
9. Hospital integrations
10. Multi-role hospital administration

## Product principles

### Doctor first

Every major action should answer:

> “Does this save the doctor time?”

### Context before clicks

The doctor should see the patient story before opening multiple screens.

### AI assists, never silently acts

AI can summarize, draft, organize, surface relevant information, and automate administrative communication.

Clinical decisions remain under explicit doctor control.

### Modular by design

The brochure's modular model should become a real product architecture:

- OPD Core
- Appointments
- Doctor Workspace
- Patient Timeline
- Communication
- AI Assistants
- Analytics
- Integrations
- Admin

Customers should be able to enable modules independently.

### Premium, not enterprise-clunky

Avoid:

- dense tables everywhere
- old-style blue hospital dashboards
- excessive sidebars
- tiny text
- 15-field forms
- modal overload

Prefer:

- focused cards
- timeline interfaces
- command-center layouts
- contextual drawers
- keyboard shortcuts
- responsive split views
- subtle animation
- strong information hierarchy

---

# 3. Target Users

## Primary: Doctor

Needs to:

- see today's patients
- understand queue status
- open a patient record quickly
- review past visits
- record consultation notes
- create prescriptions/clinical instructions
- communicate with patients
- review follow-ups
- manage schedule
- see personal OPD analytics

## Secondary: Receptionist / Front Desk

Needs to:

- register patients
- search existing patients
- book appointments
- generate tokens
- manage queue
- collect basic visit information
- send notifications
- handle cancellations/rescheduling

## Nurse / Clinical Staff

Needs to:

- view today's queue
- record vitals
- prepare patients
- see doctor instructions
- update visit status

## Hospital Admin

Needs to:

- configure doctors
- manage departments
- view operations
- manage users and roles
- monitor KPIs
- configure integrations
- manage communication templates
- manage AI assistants

## Patient

Patient-facing capabilities can initially be lightweight:

- appointment confirmation
- token updates
- follow-up reminders
- communication
- feedback
- appointment booking

---

# 4. Information Architecture

## Main navigation

### Doctor

- Home
- My Queue
- Appointments
- Patients
- Consultations
- Follow-ups
- Messages
- Analytics
- AI Copilot

### Front Desk

- Front Desk
- Today's Queue
- Appointments
- Patients
- Notifications

### Admin

- Overview
- Doctors
- Departments
- Patients
- Operations
- Reports
- Communications
- AI Assistants
- Integrations
- Settings

---

# 5. The WOW Experience

The product must have a signature experience.

## 5.1 Doctor Command Center

The default home screen should feel like a live clinical control room.

### Header

Show:

- Good morning / Good afternoon
- Doctor name
- Department
- Current date
- Online status
- Notifications
- AI Copilot button

### Top metrics

Cards:

- Patients today
- Waiting
- In consultation
- Completed
- Follow-ups due

Use subtle count-up animations when data changes.

### Main area

Left:

**Live Queue**

Example:

```text
TOKEN   PATIENT          STATUS          WAIT
A018    Priya Sharma     Waiting         08 min
A019    Ravi Kumar       With Doctor      —
A020    Meena Rao        Waiting         17 min
```

Right:

**Today's Schedule**

Show:

- appointments
- walk-ins
- breaks
- completed consultations

### Signature component: Patient Flow

Visualize:

```text
Registered
   ↓
Waiting
   ↓
Vitals
   ↓
With Doctor
   ↓
Completed
   ↓
Follow-up
```

This should update in real time.

---

# 6. Doctor Consultation Workspace

This is the most important screen in the entire application.

Do not make doctors navigate through multiple pages.

## Layout

Use a three-panel layout.

### Left panel: Patient Snapshot

Display:

- patient photo/avatar
- patient name
- age
- gender
- phone
- patient ID
- allergies
- important flags
- chronic conditions
- previous visit date

### Center: Consultation

Tabs:

- Overview
- Notes
- Vitals
- Medications
- Orders
- History

Primary consultation area:

```text
Chief Complaint

Symptoms

Clinical Notes

Assessment

Plan

Follow-up
```

### Right panel: AI Copilot

The AI panel should remain optional and contextual.

Actions:

- Summarize history
- Create pre-consultation brief
- Draft consultation note
- Summarize previous visits
- Prepare follow-up message
- Explain timeline
- Find previous prescription
- Show missing documentation

Important:

AI outputs must clearly be labeled as AI-generated suggestions.

Doctor explicitly approves anything that becomes part of the clinical record or is communicated as a medical instruction.

---

# 7. Patient 360

Create a patient profile that looks more like a modern financial timeline than a conventional hospital database.

## Header

```text
PRIYA SHARMA
P-000184
32 years • Female

Phone          ...
Last Visit     12 Sep 2026
Next Follow-up 26 Sep 2026
```

## Patient timeline

Example:

```text
20 Sep 2026
Follow-up message sent

12 Sep 2026
Consultation
Dr. Ananya Rao

12 Sep 2026
Prescription created

05 Aug 2026
Lab report uploaded

20 Jul 2026
Initial consultation
```

Each event expands inline.

## Smart timeline filters

- Consultations
- Prescriptions
- Lab reports
- Vitals
- Messages
- Payments
- Appointments

---

# 8. Pre-Consultation Brief

This should be one of the product's standout features.

When a doctor opens the next patient, generate a concise AI-assisted briefing from existing records.

Example:

```text
PATIENT BRIEF

Reason for visit
Follow-up consultation

Last visit
12 Sep 2026

Recent history
• Previous consultation recorded
• Prescription generated
• Follow-up requested

Open items
• Follow-up due today
• Recent lab report available

Suggested review
Review latest uploaded lab report before finalizing today's note.
```

The system should cite the originating patient-record events internally so the doctor can inspect the source.

Never present generated content as confirmed medical fact unless it exists in the source record.

---

# 9. AI Doctor Copilot

AI should be a product layer, not a chatbot bolted onto the dashboard.

## Copilot actions

### Patient Summary

Generate:

- concise patient history
- recent visits
- medication history
- open follow-ups
- recent reports

### Consultation Note Draft

Convert doctor-provided structured or dictated information into a formatted draft.

### Voice to Notes

Doctor speaks naturally:

```text
Patient reports headache for three days,
no fever, sleep is poor...
```

System converts it into a structured draft.

Doctor reviews and confirms.

### Follow-up Message

Generate patient-friendly communication drafts.

Example:

```text
Your follow-up consultation is scheduled for
26 September at 10:30 AM.
```

### History Search

Allow natural-language retrieval:

```text
Find the patient's last migraine-related visit.
```

### Knowledge Assistant

Internal hospital assistant that answers questions from approved hospital documents:

- SOPs
- department guidelines
- policies
- operational documentation

This corresponds to the brochure's Hospital Knowledge Assistant concept.

---

# 10. AI Safety Rules

These are product requirements.

## AI must NOT

- autonomously diagnose a patient
- silently change prescriptions
- silently change clinical records
- send medical instructions without approval
- invent patient history
- present hallucinated facts as chart data

## AI SHOULD

- summarize
- draft
- retrieve
- organize
- highlight missing information
- generate administrative communication
- assist with documentation
- clearly identify generated content

Add:

```text
AI generated
Doctor review required
```

to clinically relevant generated outputs.

---

# 11. Appointment Management

## Appointment features

- online appointment booking
- receptionist booking
- doctor schedule
- appointment types
- reschedule
- cancellation
- recurring availability
- appointment status
- no-show tracking
- waitlist

## Appointment statuses

```text
Scheduled
Checked In
Waiting
In Consultation
Completed
Cancelled
No Show
Rescheduled
```

---

# 12. Token & Queue Management

The brochure specifically includes token generation and queue management.

Build this as a first-class product.

## Features

- token generation
- token display
- queue ordering
- priority queue
- doctor status
- estimated waiting time
- counter/room assignment
- call-next action
- patient notification
- queue pause/resume

## Doctor actions

```text
Call Next
Start Consultation
Pause Queue
Complete
Move to Follow-up
```

## Patient-facing queue

Display:

```text
YOUR TOKEN
A018

CURRENT TOKEN
A015

3 patients ahead

Estimated wait
~12 min
```

---

# 13. Front Desk Mode

Create a special high-speed interface.

## Patient registration

Fields:

- patient ID
- name
- DOB / age
- gender
- phone
- email
- address
- emergency contact
- basic registration details

Avoid asking for unnecessary information during initial registration.

## Smart patient search

Support:

- name
- mobile number
- patient ID
- appointment ID

Search results should appear instantly.

---

# 14. Communication Center

Create one unified inbox for communication.

## Channels

- WhatsApp
- SMS
- Email

As described in the source brochure, communication should include appointment/token notifications, follow-up automation, feedback/review workflows, campaigns, and a unified communication engine.

Source reference: brochure pages 5–6. fileciteturn0file0L5-L7

## Message types

### Transactional

- appointment confirmation
- appointment reminder
- token generated
- token approaching
- cancellation
- reschedule
- follow-up reminder

### Engagement

- health campaign
- camp announcement
- vaccination reminder
- feedback request

## Communication timeline

For every patient:

```text
WhatsApp ✓
SMS ✓
Email ✓
```

Show:

- delivered
- failed
- read
- pending

---

# 15. Feedback & Review Automation

After completed consultations:

```text
Consultation completed
        ↓
Wait configured delay
        ↓
Send feedback request
        ↓
Collect rating
        ↓
Review / feedback workflow
```

The brochure explicitly includes patient feedback and Google review automation.

Build this as a configurable workflow rather than hard-coded logic.

---

# 16. Analytics

## Doctor analytics

Show:

- patients/day
- average consultation time
- average wait time
- completion rate
- follow-up rate
- no-show rate
- patient feedback
- repeat visits

## Admin analytics

Show:

- total OPD volume
- doctor utilization
- department volume
- peak hours
- average wait
- appointment conversion
- cancellation rate
- no-show rate
- communication delivery rate
- follow-up completion

## Visual style

Avoid dashboard overload.

Use:

- one primary trend chart
- compact metric cards
- small trend indicators
- expandable detail sections

---

# 17. Operational Intelligence

Add a product layer that detects workflow bottlenecks.

Example:

```text
OPD INSIGHT

Queue time has increased 22%
in the last 60 minutes.

Likely bottleneck:
Consultation duration
in General Medicine.

Review queue →
```

This is operational analytics, not medical decision-making.

---

# 18. Doctor Daily Brief

At login, show:

```text
YOUR DAY

32 appointments
8 follow-ups
4 new patients
2 reschedules

First appointment
09:30 AM

Peak queue expected
11:00 AM – 01:00 PM
```

Add:

**Start My Day**

This takes the doctor directly to the next active task.

---

# 19. Quick Actions

Global action button:

```text
+
New Patient
New Appointment
Start Consultation
Call Next
Send Message
Search Patient
```

Keyboard shortcut:

```text
Cmd/Ctrl + K
```

Open command palette:

```text
Search patients...
Open today's queue...
Create appointment...
Open next consultation...
```

This can become one of the product's signature interactions.

---

# 20. Notifications

Use a notification center with priority levels.

Examples:

### Normal

New appointment booked.

### Important

Patient waiting beyond configured threshold.

### Operational Alert

Queue exceeding configured capacity.

### AI

Pre-consultation brief ready.

Avoid excessive notification noise.

---

# 21. Roles & Permissions

Implement RBAC.

## Roles

```text
SUPER_ADMIN
HOSPITAL_ADMIN
DOCTOR
NURSE
RECEPTIONIST
STAFF
PATIENT
```

Permissions should be granular.

Example:

```text
patient.read
patient.create
patient.update
patient.delete

consultation.read
consultation.create
consultation.update

appointment.read
appointment.create
appointment.update

communication.send

analytics.read
admin.manage
integration.manage
```

Do not rely only on frontend hiding.

Every protected API must enforce authorization server-side.

---

# 22. Multi-Tenant Architecture

The application should support multiple hospitals/clinics.

Core hierarchy:

```text
Organization
   ↓
Hospital / Clinic
   ↓
Department
   ↓
Doctor
   ↓
Patients / Visits / Appointments
```

Every business record should carry the correct tenant context.

Never expose records across organizations.

---

# 23. Recommended Technology Stack

## Frontend

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Framer Motion
- React Hook Form
- Zod
- TanStack Query where useful

## Backend

Prefer a single Next.js application initially.

Use:

- Route Handlers
- Server Actions where appropriate
- service layer
- background jobs for asynchronous workflows

Do not put complex business logic directly inside UI components.

## Database

Recommended:

- PostgreSQL
- Prisma ORM

## Authentication

Recommended:

- Auth.js or Clerk

The implementation should support:

- secure sessions
- role-based access
- tenant-aware authorization
- optional MFA for administrators

## Storage

Use object storage for:

- reports
- scanned documents
- profile images
- attachments

## Realtime

Use a managed realtime layer or WebSocket/SSE architecture for:

- queue updates
- token changes
- notifications
- doctor availability

## AI

Keep an abstraction layer:

```text
AIProvider
 ├── OpenAI
 ├── Anthropic
 └── Future Provider
```

Do not scatter provider-specific calls throughout the application.

---

# 24. Suggested Architecture

```text
app/
  (auth)/
  (dashboard)/
    doctor/
    reception/
    admin/
  patients/
  appointments/
  consultations/
  messages/
  analytics/
  ai/
  settings/

components/
  ui/
  dashboard/
  patients/
  appointments/
  consultation/
  queue/
  communication/
  ai/
  analytics/

lib/
  auth/
  db/
  permissions/
  ai/
  communication/
  integrations/
  validation/
  audit/
  realtime/

server/
  services/
  repositories/
  workflows/

prisma/
  schema.prisma

types/
```

Recommended rule:

> UI → application service → repository/database

Avoid:

> UI → random Prisma query everywhere

---

# 25. Database Model

Start with these entities:

```text
Organization
Facility
Department
User
Role
Permission
DoctorProfile
Patient
PatientIdentifier
Appointment
Queue
QueueEntry
Visit
Consultation
Vital
Diagnosis
Medication
Prescription
LabReport
Attachment
Message
MessageTemplate
CommunicationCampaign
FollowUp
Feedback
Notification
AuditLog
Integration
AIConversation
AIAction
HospitalDocument
```

## Important relationships

```text
Organization
  └── Facility
       ├── Department
       │    └── Doctor
       └── Patient

Patient
  ├── Appointments
  ├── Visits
  ├── Consultations
  ├── Vitals
  ├── Prescriptions
  ├── Lab Reports
  ├── Messages
  └── Follow-ups
```

---

# 26. Consultation Data Model

Store structured data wherever possible.

Example:

```ts
type Consultation = {
  id: string
  patientId: string
  doctorId: string
  visitId: string

  chiefComplaint?: string
  symptoms?: string
  history?: string
  examination?: string
  assessment?: string
  plan?: string

  doctorNotes?: string

  status: "DRAFT" | "REVIEWED" | "SIGNED"

  aiGeneratedSections?: {
    summary?: string
    noteDraft?: string
  }

  signedAt?: Date
}
```

Clinical schemas should be expanded with domain review before production use.

---

# 27. API Design

Example route groups:

```text
/api/auth

/api/patients
/api/patients/:id

/api/appointments
/api/appointments/:id

/api/queue
/api/queue/:id/call-next
/api/queue/:id/start
/api/queue/:id/complete

/api/visits
/api/consultations

/api/prescriptions
/api/vitals
/api/labs

/api/messages
/api/message-templates
/api/campaigns

/api/followups
/api/feedback

/api/analytics

/api/ai/patient-summary
/api/ai/pre-consultation
/api/ai/note-draft
/api/ai/follow-up-draft

/api/integrations
```

Use typed validation for every request.

---

# 28. Workflow Engine

Do not hard-code all communication automations.

Create reusable workflow primitives.

Example:

```text
TRIGGER
Appointment Completed

WAIT
2 hours

ACTION
Send WhatsApp Feedback Request

CONDITION
Patient has phone number

ACTION
Create Feedback Record
```

Another:

```text
TRIGGER
Appointment Scheduled

ACTION
Send Confirmation

WAIT
24 hours

ACTION
Send Reminder
```

This creates a scalable automation engine.

---

# 29. Integration Layer

The brochure describes integration with:

- HMS / EMR
- lab systems
- pharmacy
- WhatsApp / SMS
- email
- other APIs

Keep each integration behind an adapter.

```ts
interface IntegrationProvider {
  connect(): Promise<void>
  healthCheck(): Promise<unknown>
  sync(): Promise<unknown>
}
```

Initial integration categories:

```text
WhatsAppProvider
SmsProvider
EmailProvider
LabProvider
PharmacyProvider
HmsProvider
```

The UI should expose:

```text
Connected
Needs Attention
Disconnected
Not Configured
```

---

# 30. Audit Logging

Healthcare software needs strong traceability.

Log:

- login
- logout
- record created
- record updated
- record viewed where appropriate
- prescription created
- consultation signed
- AI output generated
- AI output accepted
- message sent
- integration changed
- permission changed

Example:

```text
22 Sep 2026 • 10:42
Dr. Ananya Rao
Signed consultation
Patient P-000184
```

---

# 31. Security Requirements

Implement:

- server-side authorization
- tenant isolation
- secure session management
- encrypted transport
- secure secret management
- audit logs
- file access controls
- signed URLs for private files
- rate limiting
- input validation
- CSRF protection where applicable
- safe output encoding
- prompt injection defenses for document-based AI
- strict separation of patient data and analytics where appropriate

Never expose secrets in client-side code.

---

# 32. AI Architecture

Use a layered system.

```text
Doctor UI
   ↓
AI Application Service
   ↓
Prompt / Tool Orchestrator
   ↓
Retrieval Layer
   ↓
Approved Data Sources
   ↓
LLM Provider
   ↓
Validation
   ↓
Doctor Review
   ↓
Audit Log
```

For hospital knowledge:

```text
Hospital Documents
   ↓
Parser
   ↓
Chunking
   ↓
Embeddings
   ↓
Vector / Hybrid Search
   ↓
Retriever
   ↓
LLM
```

Every AI response should preserve source context whenever factual retrieval is involved.

---

# 33. Design System

## Visual direction

The brochure uses a restrained healthcare palette built around:

- warm white / off-white
- deep navy
- orange accent
- charcoal
- soft neutral surfaces

Use the brochure's orange as an accent, not as the dominant UI color.

## Typography

Use a modern sans-serif with:

- strong display hierarchy
- clean body text
- comfortable line height
- clear numerical typography

## UI style

Cards should be:

- lightly rounded
- spacious
- subtle borders
- very soft shadows
- minimal gradients

Avoid making every component a card.

## Motion

Use animation only where it improves comprehension.

Examples:

- queue movement
- status changes
- drawer transitions
- AI generation states
- metric updates

Avoid excessive motion.

---

# 34. Responsive Design

Desktop is primary for hospital workstations.

Support:

### Desktop

1920px
1440px
1280px

### Tablet

1024px
768px

### Mobile

430px
390px

Reception and doctor workflows should remain usable on tablets.

Patient-facing experiences should be mobile-first.

---

# 35. UX Rules

## Rule 1

A doctor should reach the next patient in one click.

## Rule 2

Patient search should feel instant.

## Rule 3

Never force a doctor through a wizard for routine work.

## Rule 4

Persist drafts automatically.

## Rule 5

Warn before destructive actions.

## Rule 6

Show status visually.

## Rule 7

Use inline editing when safe.

## Rule 8

Use keyboard shortcuts for high-frequency operations.

---

# 36. Empty States

Do not use generic:

> No data found.

Use useful empty states.

Example:

```text
No patients waiting

Your queue is clear.
Enjoy the breathing room.

[View today's appointments]
```

---

# 37. Loading States

Use skeletons that match the actual layout.

Never show large generic spinners for data-heavy screens.

AI:

```text
Reviewing patient timeline...
Preparing a concise summary...
```

But do not imply medical certainty from AI processing language.

---

# 38. Error States

Errors should tell users what to do next.

Bad:

```text
Something went wrong.
```

Better:

```text
We couldn't send the WhatsApp message.

The communication provider is temporarily unavailable.

[Retry]
```

---

# 39. Demo Data

Seed the application with realistic demo content.

## Demo organization

```text
AADRIQUE Medical Center
Hyderabad
```

## Departments

- General Medicine
- Pediatrics
- Dermatology
- Cardiology
- Orthopedics

## Doctors

Create at least 5 demo doctors.

## Patients

Create:

- 100 patients
- 250 historical visits
- 50 appointments
- 20 follow-ups
- 15 prescriptions
- 10 lab reports
- 100 communication events

This is critical for making the product visually impressive during demos.

---

# 40. Demo Scenario

The homepage should allow a prospective customer to experience this in under two minutes.

### Scenario

1. Login as doctor.
2. See daily dashboard.
3. Open current queue.
4. Click patient.
5. See Patient 360.
6. Open consultation.
7. Generate pre-consultation brief.
8. Review previous visit.
9. Create consultation note.
10. Approve AI-generated draft.
11. Complete consultation.
12. Automatically create follow-up task.
13. Show communication event.
14. Return to dashboard.
15. Queue updates in real time.

This single journey demonstrates most of the product.

---

# 41. Signature Features To Make It Stand Out

## A. Doctor Morning Brief

A personalized daily command center.

## B. One-Click Next Patient

Doctor never manually hunts for the next patient.

## C. Patient 360 Timeline

Full patient story in one place.

## D. AI Pre-Consultation Brief

AI prepares context before the doctor enters the visit.

## E. AI Documentation Copilot

Turns doctor input into structured documentation.

## F. Smart Queue Intelligence

Highlights operational delays.

## G. Communication Autopilot

Runs configurable patient communication workflows.

## H. Command Palette

`Cmd/Ctrl + K` for instant actions.

## I. Universal Patient Search

Search any patient from anywhere.

## J. Operational Pulse

A live visual showing:

```text
OPD Health
● Normal
```

or

```text
OPD Health
● Attention Needed
```

based on measurable operational rules.

## K. Zero-Click Return

When a doctor finishes one consultation, automatically surface the next appropriate task.

---

# 42. Optional Advanced Features

Build these after the core product is stable.

## Voice-first doctor workflow

Doctor can dictate notes.

## Smart follow-up queue

```text
Follow-ups today
8 patients

2 overdue
3 due today
3 upcoming
```

## Patient reactivation

Identify patients with completed consultation but missed follow-up.

## Doctor workload visualization

Display workload across:

- appointments
- walk-ins
- active queue
- follow-ups

## Smart appointment suggestions

Suggest available slots based on configured rules.

Do not automatically select or book a slot without user confirmation unless an explicitly configured workflow permits it.

## Hospital knowledge assistant

Ask:

```text
What is the current discharge workflow?
```

Retrieve from approved hospital documents.

## Multi-language patient communication

Draft patient messages in configured languages while preserving the doctor's approved intent.

---

# 43. What NOT To Build Initially

Do not try to build the entire hospital ecosystem in version 1.

Avoid starting with:

- complex billing
- insurance claims
- inventory
- payroll
- HR
- full pharmacy management
- full lab information system
- autonomous diagnosis
- autonomous prescription generation
- complex inpatient workflows

First dominate:

> **OPD + Doctor Workspace + Patient 360 + Communication + AI Assistance**

---

# 44. MVP

## Phase 1

### Authentication

- login
- role selection
- tenant-aware auth

### Dashboard

- doctor dashboard
- live queue
- appointments
- metrics

### Patient

- patient registration
- search
- profile
- timeline

### Appointment

- create
- reschedule
- cancel
- status

### Queue

- token generation
- call next
- start consultation
- complete consultation

### Consultation

- notes
- vitals
- history
- prescription draft
- save
- sign

---

# 45. Phase 2

- Patient 360 improvements
- Communication center
- WhatsApp/SMS/email abstraction
- follow-up automation
- feedback automation
- analytics
- notifications
- audit logs

---

# 46. Phase 3

- AI Copilot
- pre-consultation brief
- AI note draft
- voice notes
- patient history retrieval
- hospital knowledge assistant

---

# 47. Phase 4

- integrations
- advanced analytics
- workflow builder
- multi-location operations
- advanced admin
- patient portal

---

# 48. Folder-Level Implementation Plan

## Step 1

Create the project.

```bash
npx create-next-app@latest aadrique-doctor-os
```

Choose:

```text
TypeScript
ESLint
Tailwind CSS
App Router
src/
```

## Step 2

Install core UI dependencies.

```bash
npm install lucide-react
npm install framer-motion
npm install zod
npm install react-hook-form
npm install @hookform/resolvers
```

Then add the chosen component system.

## Step 3

Set up database.

```bash
npm install prisma @prisma/client
npx prisma init
```

## Step 4

Create authentication.

## Step 5

Create tenant + RBAC layer.

## Step 6

Create dashboard shell.

## Step 7

Implement Patient 360.

## Step 8

Implement appointment and queue engine.

## Step 9

Implement consultation workspace.

## Step 10

Implement communication abstraction.

## Step 11

Implement AI abstraction.

## Step 12

Add analytics.

## Step 13

Add audit logging.

## Step 14

Add integrations.

---

# 49. Component Naming Plan

Examples:

```text
DoctorDashboard
DoctorDailyBrief
LiveQueue
QueueEntry
PatientSnapshot
PatientTimeline
PatientHeader
ConsultationWorkspace
ConsultationNotes
VitalsPanel
PrescriptionPanel
AiCopilot
PreConsultationBrief
AppointmentCalendar
AppointmentCard
CommunicationTimeline
MessageComposer
FollowUpQueue
OperationalPulse
MetricCard
CommandPalette
NotificationCenter
```

---

# 50. Code Quality Rules

## TypeScript

Do not use:

```ts
any
```

unless there is a documented reason.

## Validation

Validate all external input using Zod or equivalent.

## Components

Keep components small.

Avoid a 1,000-line dashboard component.

## Business logic

Keep business logic outside UI components.

## Database

Use transactions where workflows contain multiple dependent writes.

## Error handling

Use structured errors.

## Logging

Use structured server logs.

Never log patient-sensitive content unnecessarily.

---

# 51. Accessibility

Support:

- keyboard navigation
- visible focus states
- semantic HTML
- ARIA where required
- sufficient contrast
- screen-reader-friendly labels
- reduced-motion preferences

The consultation workspace must remain usable without a mouse for common actions.

---

# 52. Performance Targets

Aim for:

- fast first render
- low JavaScript shipped to initial routes
- server-side data fetching where appropriate
- optimistic UI for safe interactions
- instant patient search experience
- debounced API calls
- pagination for large datasets
- virtualized long timelines if necessary

Avoid loading the whole hospital dataset into the browser.

---

# 53. Testing Strategy

## Unit tests

Test:

- permissions
- appointment rules
- queue rules
- follow-up workflows
- message templates
- AI validation
- tenant isolation

## Integration tests

Test:

```text
Appointment → Queue → Consultation → Follow-up
```

## E2E tests

Test major user journeys.

### Doctor

```text
Login
→ Open Dashboard
→ Open Patient
→ Start Consultation
→ Save
→ Sign
→ Next Patient
```

### Reception

```text
Search Patient
→ Book Appointment
→ Generate Token
→ Notification
```

### Admin

```text
Create Doctor
→ Assign Department
→ Configure Schedule
```

---

# 54. Acceptance Criteria

## Dashboard

- Doctor sees current queue
- Doctor sees today's schedule
- Queue updates without manual refresh
- Doctor reaches active consultation in one click

## Patient

- Search by patient ID/name/mobile
- Patient timeline loads quickly
- Previous visits are visible
- Important flags are clearly displayed

## Consultation

- Doctor can save drafts
- Doctor can sign consultation
- Draft survives refresh
- AI content is clearly labeled
- AI cannot silently write to finalized clinical records

## Communication

- Messages have delivery status
- Templates are editable
- Follow-up workflows can be configured

## Security

- Users cannot access another tenant's data
- Protected routes enforce server-side authorization
- Audit entries exist for important actions

---

# 55. Product Copy

## Main positioning

**Modern Healthcare Runs Smarter.**

Alternative hero:

**Your OPD. One intelligent workspace.**

Supporting line:

**Appointments, queues, patient records, communication and AI assistance — designed around the way doctors actually work.**

## Doctor dashboard

**Your day, at a glance.**

## Patient 360

**The whole patient story. One timeline.**

## AI

**Less documentation. More attention.**

## Queue

**Know who is next. Before they ask.**

## Communication

**The right message. The right patient. The right time.**

---

# 56. Visual Inspiration Direction

The brochure establishes a premium healthcare identity using:

- orange brand accents
- deep navy/black sections
- warm white surfaces
- modern healthcare photography
- concise feature statements
- modular product framing

The application should preserve this brand language while moving the interface into a significantly more premium product direction.

Source reference: brochure pages 1–3. fileciteturn0file0L2-L4

The source brochure's OPD page lists registration/token management, appointments, doctor dashboard, patient history/visit records, and OPD analytics. Use those as the foundational module set. fileciteturn0file0L5-L5

The source brochure's final page adds AI enquiry, appointment and voice assistants plus a hospital knowledge assistant and integrations. fileciteturn0file0L7-L7

---

# 57. Claude Code / AI Coding Instructions

Use this document as the master product specification.

## Development behavior

Before implementing a feature:

1. Read the relevant existing files.
2. Understand the current architecture.
3. Reuse existing components.
4. Avoid duplicating logic.
5. Implement the smallest clean abstraction.
6. Run type checks.
7. Run linting.
8. Test the changed flow.
9. Only then move to the next feature.

## Never

- rewrite the entire app for a small feature
- introduce random libraries without reason
- create duplicated components
- put secrets in frontend code
- bypass authorization for demos
- use fake AI responses in production code paths
- destroy existing functionality while adding new functionality

---

# 58. Build Order for Claude Code

Use this exact order.

```text
01. Project setup
02. Design system
03. App shell
04. Authentication
05. RBAC
06. Tenant architecture
07. Dashboard
08. Patient module
09. Appointment module
10. Queue module
11. Consultation workspace
12. Patient 360
13. Follow-up module
14. Communication center
15. Analytics
16. Audit logs
17. AI abstraction
18. AI pre-consultation brief
19. AI documentation copilot
20. AI history retrieval
21. Workflow engine
22. Integrations
23. Admin
24. Testing
25. Performance
26. Security review
27. Production polish
```

---

# 59. Definition of Done

The product is considered ready for a serious demo when:

- The interface looks premium on a 1440px desktop
- A doctor can understand the dashboard instantly
- A doctor can open the next patient in one click
- Patient history is consolidated into one timeline
- Queue state updates live
- Consultation can be completed without leaving the workspace
- AI can produce a reviewable pre-consultation brief
- AI-generated notes require doctor confirmation
- Communication workflows can be demonstrated
- Analytics display meaningful demo data
- Role permissions work
- Tenant boundaries are enforced
- Audit logs are visible to authorized users
- The application has realistic seeded data
- No placeholder lorem ipsum remains in major screens

---

# 60. Final Product Architecture

The final conceptual architecture should look like this:

```text
                    AADRIQUE DOCTOR OS
                           │
          ┌────────────────┼────────────────┐
          │                │                │
       OPERATIONS        CLINICAL           AI
          │                │                │
   ┌──────┼──────┐   ┌─────┼──────┐   ┌────┼─────────┐
   │      │      │   │     │      │   │    │         │
Appointments Queue Patients Visits Notes Briefs   Documentation
   │      │      │   │     │      │   │    │         │
   └──────┴──────┴───┴─────┴──────┴───┴────┴─────────┘
                           │
                     COMMUNICATION
                           │
                WhatsApp / SMS / Email
                           │
                     INTEGRATIONS
                           │
             HMS / EMR / Labs / Pharmacy
```

The product should feel like one intelligent system rather than a collection of disconnected hospital modules.

---

# 61. The North Star

The user should never feel:

> “I am using hospital software.”

They should feel:

> **“I have a clinical command center.”**

That difference should drive every screen, interaction, component, animation and engineering decision.
