"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(dashboard)/notification-actions";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsReadAction();
          router.refresh();
        })
      }
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}
      Mark all read
    </Button>
  );
}

/**
 * Opens a notification: marks it read, then follows its link if it has one.
 * Rendered as the row itself so the whole row is the target.
 */
export function NotificationLink({
  id,
  href,
  read,
  children,
  className,
}: {
  id: string;
  href: string | null;
  read: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  return (
    <button
      type="button"
      className={className}
      onClick={() =>
        startTransition(async () => {
          if (!read) await markNotificationReadAction(id);
          if (href) router.push(href);
          else router.refresh();
        })
      }
    >
      {children}
    </button>
  );
}
