import type { WorkflowTriggerType } from "@/generated/prisma/enums";
import type { WorkflowStep } from "@/lib/workflow/steps";

/**
 * Spec §14 + §28 — what a new clinic starts with: the message templates the
 * standard automations send, and those automations. Everything here is data
 * the clinic's admin can edit afterwards; none of it names a clinic, so it
 * reads correctly for whoever uses it. Messages stay simulated until the
 * admin connects a gateway (spec §29).
 */

export interface StarterTemplate {
  key: string;
  name: string;
  channel: "WHATSAPP" | "SMS" | "EMAIL";
  category: "TRANSACTIONAL" | "ENGAGEMENT";
  subject?: string;
  body: string;
  variables: string[];
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: "appointment_confirmation",
    name: "Appointment confirmation",
    channel: "WHATSAPP",
    category: "TRANSACTIONAL",
    body: "Hello {{patientName}}, your appointment with {{doctorName}} is confirmed for {{appointmentDate}} at {{appointmentTime}}.",
    variables: ["patientName", "doctorName", "appointmentDate", "appointmentTime"],
  },
  {
    key: "appointment_reminder",
    name: "Appointment reminder",
    channel: "WHATSAPP",
    category: "TRANSACTIONAL",
    body: "Reminder: your appointment with {{doctorName}} is tomorrow at {{appointmentTime}}. Call {{facilityPhone}} if you need a different time.",
    variables: ["doctorName", "appointmentTime", "facilityPhone"],
  },
  {
    key: "token_generated",
    name: "Token generated",
    channel: "SMS",
    category: "TRANSACTIONAL",
    body: "Your token is {{token}}. Current token is {{currentToken}}. Estimated wait {{waitMinutes}} minutes.",
    variables: ["token", "currentToken", "waitMinutes"],
  },
  {
    key: "token_approaching",
    name: "Token approaching",
    channel: "SMS",
    category: "TRANSACTIONAL",
    body: "{{patientName}}, you are next with {{doctorName}}. Please be ready.",
    variables: ["patientName", "doctorName"],
  },
  {
    key: "appointment_cancelled",
    name: "Appointment cancelled",
    channel: "SMS",
    category: "TRANSACTIONAL",
    body: "Your appointment with {{doctorName}} on {{appointmentDate}} has been cancelled. Call {{facilityPhone}} to rebook.",
    variables: ["doctorName", "appointmentDate", "facilityPhone"],
  },
  {
    key: "follow_up_reminder",
    name: "Follow-up reminder",
    channel: "WHATSAPP",
    category: "TRANSACTIONAL",
    body: "Hello {{patientName}}, your follow-up with {{doctorName}} is due on {{followUpDate}}.",
    variables: ["patientName", "doctorName", "followUpDate"],
  },
  {
    key: "feedback_request",
    name: "Feedback request",
    channel: "WHATSAPP",
    category: "ENGAGEMENT",
    body: "Thank you for visiting {{doctorName}} today. How was your experience? Reply with a rating from 1 to 5.",
    variables: ["doctorName"],
  },
];

export interface StarterWorkflow {
  name: string;
  description: string;
  trigger: WorkflowTriggerType;
  steps: WorkflowStep[];
}

export const STARTER_WORKFLOWS: StarterWorkflow[] = [
  {
    name: "Appointment confirmation and reminder",
    description: "Confirm on booking, then remind 24 hours before.",
    trigger: "APPOINTMENT_SCHEDULED",
    steps: [
      { type: "CONDITION", field: "patient.whatsappOptIn", operator: "EQUALS", value: true },
      { type: "ACTION", action: "SEND_MESSAGE", templateKey: "appointment_confirmation", channel: "WHATSAPP" },
      { type: "WAIT", until: "24_HOURS_BEFORE_APPOINTMENT" },
      { type: "CONDITION", field: "appointment.status", operator: "EQUALS", value: "SCHEDULED" },
      { type: "ACTION", action: "SEND_MESSAGE", templateKey: "appointment_reminder", channel: "WHATSAPP" },
    ],
  },
  {
    name: "Feedback request after consultation",
    description: "Wait two hours after a completed visit, then ask for a rating.",
    trigger: "APPOINTMENT_COMPLETED",
    steps: [
      { type: "WAIT", duration: { hours: 2 } },
      { type: "ACTION", action: "CREATE_FEEDBACK_RECORD" },
      { type: "CONDITION", field: "patient.whatsappOptIn", operator: "EQUALS", value: true },
      { type: "ACTION", action: "SEND_MESSAGE", templateKey: "feedback_request", channel: "WHATSAPP" },
    ],
  },
  {
    name: "Follow-up reminder",
    description: "Remind the patient the day before a follow-up is due.",
    trigger: "FOLLOW_UP_DUE",
    steps: [
      { type: "WAIT", until: "1_DAY_BEFORE_DUE" },
      { type: "CONDITION", field: "followUp.status", operator: "EQUALS", value: "PENDING" },
      { type: "ACTION", action: "SEND_MESSAGE", templateKey: "follow_up_reminder", channel: "WHATSAPP" },
    ],
  },
  {
    name: "Token notification",
    description: "Tell the patient their token as soon as it is issued.",
    trigger: "TOKEN_GENERATED",
    steps: [
      { type: "CONDITION", field: "patient.smsOptIn", operator: "EQUALS", value: true },
      { type: "ACTION", action: "SEND_MESSAGE", templateKey: "token_generated", channel: "SMS" },
    ],
  },
  {
    name: "You're next",
    description: "Tell the patient at the front of the line to get ready.",
    trigger: "TOKEN_APPROACHING",
    steps: [
      { type: "CONDITION", field: "patient.smsOptIn", operator: "EQUALS", value: true },
      { type: "ACTION", action: "SEND_MESSAGE", templateKey: "token_approaching", channel: "SMS" },
    ],
  },
  {
    name: "Cancellation notice",
    description: "Tell the patient when their appointment is cancelled, and how to rebook.",
    trigger: "APPOINTMENT_CANCELLED",
    steps: [
      { type: "CONDITION", field: "patient.smsOptIn", operator: "EQUALS", value: true },
      { type: "ACTION", action: "SEND_MESSAGE", templateKey: "appointment_cancelled", channel: "SMS" },
    ],
  },
];

/** The gateways a clinic can connect, listed so the admin sees what is missing. */
export const STARTER_INTEGRATIONS = [
  { category: "WHATSAPP", provider: "meta-cloud-api", name: "WhatsApp Business" },
  { category: "SMS", provider: "msg91", name: "SMS Gateway" },
  { category: "EMAIL", provider: "resend", name: "Transactional Email" },
] as const;
