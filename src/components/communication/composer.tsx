"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  loadTemplatesAction,
  sendMessageAction,
  type TemplateChoice,
} from "@/app/(dashboard)/doctor/messages/actions";
import { CHANNEL_LABEL, CHANNEL_ICON } from "./delivery";

type Channel = "WHATSAPP" | "SMS" | "EMAIL";

/**
 * Spec §14 — the composer.
 *
 * A template fills the box and stays editable; it is a starting point, not a
 * cage. Placeholders the template leaves behind are highlighted, because a
 * patient receiving a literal `{{patientName}}` is the failure this screen
 * exists to prevent.
 */
export function Composer({
  patientId,
  patientName,
  consented,
}: {
  patientId: string;
  patientName: string;
  consented: Channel[];
}) {
  const router = useRouter();
  const [channel, setChannel] = React.useState<Channel | null>(
    consented[0] ?? null,
  );
  const [loaded, setLoaded] = React.useState<{
    channel: Channel;
    list: TemplateChoice[];
  } | null>(null);
  const [chosen, setChosen] = React.useState<{
    channel: Channel;
    id: string;
  } | null>(null);
  const [body, setBody] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [, startLoading] = React.useTransition();

  React.useEffect(() => {
    if (!channel) return;

    let cancelled = false;
    startLoading(async () => {
      const list = await loadTemplatesAction(channel);
      if (!cancelled) setLoaded({ channel, list });
    });

    return () => {
      cancelled = true;
    };
  }, [channel]);

  // Both are keyed by channel, so switching channel invalidates them without
  // an effect that resets state and cascades a render.
  const templates = loaded?.channel === channel ? loaded.list : [];
  const templateId = chosen?.channel === channel ? chosen.id : null;

  if (consented.length === 0 || !channel) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {patientName.split(" ")[0]} has not agreed to be contacted on any
        channel. The front desk can record a preference on their record.
      </p>
    );
  }

  // Anything the template did not fill is still a hole (spec §38).
  const unfilled = [...body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(
    (m) => m[1],
  );

  function applyTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!channel) return;
    setChosen({ channel, id });
    if (template) setBody(template.body);
  }

  function send() {
    startTransition(async () => {
      const result = await sendMessageAction({
        patientId,
        channel: channel as Channel,
        templateId: null,
        body,
      });

      if (result.ok) {
        toast.success(result.message ?? "Sent.");
        setBody("");
        setChosen(null);
        router.refresh();
      } else {
        toast.error(result.message ?? "That did not send.", {
          description: result.action,
        });
      }
    });
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
          {consented.map((option) => {
            const Icon = CHANNEL_ICON[option];
            return (
              <button
                key={option}
                type="button"
                aria-pressed={channel === option}
                onClick={() => setChannel(option)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-semibold transition-colors",
                  channel === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {CHANNEL_LABEL[option]}
              </button>
            );
          })}
        </div>

        <Select
          value={templateId ?? ""}
          onValueChange={applyTemplate}
          disabled={templates.length === 0}
        >
          <SelectTrigger className="h-8 w-52" aria-label="Use a template">
            <SelectValue
              placeholder={
                templates.length === 0
                  ? "No templates"
                  : "Start from a template"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={`Write to ${patientName.split(" ")[0]} on ${CHANNEL_LABEL[channel]}…`}
        aria-label="Message body"
        className="resize-none text-[13px]"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          {unfilled.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-warning">
              <Sparkles className="size-3.5" />
              Fill in {unfilled.map((v) => `{{${v}}}`).join(", ")} first
            </span>
          ) : (
            <span className="tabular">{body.length}/2000</span>
          )}
        </p>

        <Button
          size="sm"
          variant="accent"
          disabled={pending || body.trim().length === 0 || unfilled.length > 0}
          onClick={send}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <Send />}
          Send
        </Button>
      </div>
    </div>
  );
}
