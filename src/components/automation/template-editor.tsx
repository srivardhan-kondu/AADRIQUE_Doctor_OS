"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { placeholdersIn, renderTemplate } from "@/lib/messaging";
import { KNOWN_VARIABLES } from "@/lib/workflow/triggers";
import { saveTemplateAction } from "@/app/(dashboard)/admin/communications/actions";
import type { TemplateEdit } from "@/server/services/automation-editor";

/**
 * Spec §14 + §54 — "templates are editable". The preview fills every
 * placeholder with a sample, so what the patient will read is visible while
 * writing; a placeholder nothing can fill is flagged before it is saved.
 */

const SAMPLE: Record<string, string> = {
  patientName: "Asha",
  doctorName: "Dr. Ananya Rao",
  facilityPhone: "040 4488 2200",
  appointmentDate: "Thu, 24 Sept",
  appointmentTime: "10:30 am",
  followUpDate: "Mon, 6 Oct",
  followUpTime: "11:00 am",
  token: "A018",
  currentToken: "A015",
  waitMinutes: "12",
  roomLabel: "Room 101",
  statusLink: "https://opd.example.org/q/…",
  campDate: "Sunday, 28 September",
};

const LIMIT = { WHATSAPP: 1024, SMS: 480, EMAIL: 5000 } as const;

export function TemplateEditor({ template }: { template: TemplateEdit }) {
  const router = useRouter();
  const [form, setForm] = React.useState(template);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof TemplateEdit>(key: K, value: TemplateEdit[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const used = placeholdersIn(`${form.subject ?? ""} ${form.body}`);
  const unknown = used.filter((p) => !KNOWN_VARIABLES.includes(p));

  function insert(name: string) {
    const el = bodyRef.current;
    const token = `{{${name}}}`;
    if (!el) return set("body", `${form.body}${token}`);
    const start = el.selectionStart ?? form.body.length;
    const end = el.selectionEnd ?? start;
    set("body", form.body.slice(0, start) + token + form.body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveTemplateAction(form);
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        router.push("/admin/communications");
        router.refresh();
      } else {
        setError([result.message, result.action].filter(Boolean).join(" "));
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Card className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="t-name" label="Name">
            <Input id="t-name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} />
          </Field>
          <Field id="t-key" label="Key" hint="What a workflow refers to it by.">
            <Input
              id="t-key"
              className="font-mono"
              value={form.key}
              onChange={(e) => set("key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              maxLength={41}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="t-channel" label="Channel">
            <Select value={form.channel} onValueChange={(v) => set("channel", v as TemplateEdit["channel"])}>
              <SelectTrigger id="t-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="t-category" label="Kind">
            <Select value={form.category} onValueChange={(v) => set("category", v as TemplateEdit["category"])}>
              <SelectTrigger id="t-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TRANSACTIONAL">About their care</SelectItem>
                <SelectItem value="ENGAGEMENT">Engagement</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="t-lang" label="Language">
            <Select value={form.language} onValueChange={(v) => set("language", v)}>
              <SelectTrigger id="t-lang"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[["en", "English"], ["hi", "Hindi"], ["te", "Telugu"], ["ta", "Tamil"], ["kn", "Kannada"], ["ml", "Malayalam"]].map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {form.channel === "EMAIL" && (
          <Field id="t-subject" label="Subject">
            <Input id="t-subject" value={form.subject ?? ""} onChange={(e) => set("subject", e.target.value)} maxLength={200} />
          </Field>
        )}

        <Field
          id="t-body"
          label="Message"
          hint={`${form.body.length} / ${LIMIT[form.channel]} characters`}
        >
          <Textarea
            id="t-body"
            ref={bodyRef}
            rows={6}
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            maxLength={LIMIT[form.channel]}
          />
        </Field>

        <div>
          <p className="text-[12px] font-semibold text-muted-foreground">Insert a detail</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {KNOWN_VARIABLES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => insert(name)}
                className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px] hover:bg-muted"
              >
                {`{{${name}}}`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            A workflow can only send a template whose details its trigger knows — the workflow editor says which.
          </p>
        </div>

        {form.channel !== "EMAIL" && (
          <Field
            id="t-provider"
            label={form.channel === "SMS" ? "MSG91 flow id (DLT)" : "Approved WhatsApp template name"}
            hint={
              form.channel === "SMS"
                ? "Required to send SMS in India. The flow's variables must be named like the details above."
                : "Needed to message a patient who has not written in the last 24 hours."
            }
          >
            <Input
              id="t-provider"
              value={form.providerTemplateId ?? ""}
              onChange={(e) => set("providerTemplateId", e.target.value || null)}
              maxLength={120}
            />
          </Field>
        )}

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            checked={form.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          In use — workflows and the message composer can send it
        </label>

        {(error || unknown.length > 0) && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error ?? `Nothing fills ${unknown.map((p) => `{{${p}}}`).join(", ")} — pick from the details above.`}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => router.push("/admin/communications")}>Cancel</Button>
          <Button variant="accent" onClick={save} disabled={pending || unknown.length > 0}>
            {pending && <LoaderCircle className="animate-spin" />}
            Save template
          </Button>
        </div>
      </Card>

      <Card className="h-fit p-5">
        <p className="text-[12px] font-mediumr text-muted-foreground">
          What the patient reads
        </p>
        <div className="mt-3 rounded-xl bg-muted/60 p-4">
          {form.channel === "EMAIL" && form.subject && (
            <p className="mb-2 text-[13px] font-semibold">{renderTemplate(form.subject, SAMPLE)}</p>
          )}
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
            {form.body ? renderTemplate(form.body, SAMPLE) : <span className="text-muted-foreground">Start writing…</span>}
          </p>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Sample values; the real ones are filled when it is sent.</p>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[12px] font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
