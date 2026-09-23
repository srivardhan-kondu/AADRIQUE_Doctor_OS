import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock3,
  Mail,
  MessageCircle,
  Smartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Spec §14 — one vocabulary for delivery state.
 *
 * Status is never colour alone: every state carries an icon and a word, so it
 * survives colour blindness, a monochrome print and a glance.
 */

export type DeliveryStatus =
  | "PENDING"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";

const STATUS: Record<
  DeliveryStatus,
  { icon: LucideIcon; label: string; className: string }
> = {
  PENDING: { icon: Clock3, label: "Pending", className: "text-muted-foreground" },
  QUEUED: { icon: Clock3, label: "Queued", className: "text-muted-foreground" },
  SENT: { icon: Check, label: "Sent", className: "text-muted-foreground" },
  DELIVERED: { icon: CheckCheck, label: "Delivered", className: "text-info" },
  READ: { icon: CheckCheck, label: "Read", className: "text-success" },
  FAILED: { icon: AlertCircle, label: "Failed", className: "text-destructive" },
};

export function DeliveryState({
  status,
  showLabel = true,
  className,
}: {
  status: DeliveryStatus;
  showLabel?: boolean;
  className?: string;
}) {
  const { icon: Icon, label, className: tone } = STATUS[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-semibold",
        tone,
        className,
      )}
      title={label}
    >
      <Icon className="size-3.5" aria-hidden />
      {showLabel ? label : <span className="sr-only">{label}</span>}
    </span>
  );
}

export const CHANNEL_ICON: Record<
  "WHATSAPP" | "SMS" | "EMAIL",
  LucideIcon
> = {
  WHATSAPP: MessageCircle,
  SMS: Smartphone,
  EMAIL: Mail,
};

export const CHANNEL_LABEL: Record<"WHATSAPP" | "SMS" | "EMAIL", string> = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "Email",
};

export function ChannelBadge({
  channel,
  className,
}: {
  channel: "WHATSAPP" | "SMS" | "EMAIL";
  className?: string;
}) {
  const Icon = CHANNEL_ICON[channel];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {CHANNEL_LABEL[channel]}
    </span>
  );
}
