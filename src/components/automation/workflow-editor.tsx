"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  GitBranch,
  LoaderCircle,
  Play,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import type { WorkflowTriggerType } from "@/generated/prisma/enums";
import {
  type ActionStep,
  type ConditionStep,
  type WaitStep,
  type WorkflowStep,
  describeStep,
} from "@/lib/workflow/steps";
import {
  SUBJECTS,
  TRIGGERS,
  type TemplateRef,
  workflowProblem,
} from "@/lib/workflow/triggers";
import { saveWorkflowAction } from "@/app/(dashboard)/admin/communications/actions";

/**
 * Spec §28 — the workflow builder. A trigger, then steps, edited as a list.
 * The same validation the server runs is shown live, so a workflow that
 * could only fail when it runs cannot be saved.
 */

type Keyed = WorkflowStep & { key: string };

let counter = 0;
const keyed = (step: WorkflowStep): Keyed => ({ ...step, key: `s${(counter += 1)}` });
const strip = ({ key: _key, ...step }: Keyed): WorkflowStep => step as WorkflowStep;

const ANCHOR_LABEL: Record<string, string> = {
  "24_HOURS_BEFORE_APPOINTMENT": "24 hours before the appointment",
  "1_DAY_BEFORE_DUE": "The day before the follow-up is due",
  "2_HOURS_AFTER_COMPLETION": "Two hours after the visit ends",
};

const ACTION_LABEL: Record<ActionStep["action"], string> = {
  SEND_MESSAGE: "Send a message",
  CREATE_FEEDBACK_RECORD: "Ask for feedback (record)",
  CREATE_FOLLOW_UP: "Create a follow-up",
  NOTIFY_STAFF: "Notify staff",
};

const CHANNEL_LABEL = { WHATSAPP: "WhatsApp", SMS: "SMS", EMAIL: "Email" } as const;

export interface TemplateChoice extends TemplateRef {
  name: string;
}

export function WorkflowEditor({
  workflow,
  templates,
}: {
  workflow: {
    id: string | null;
    name: string;
    description: string | null;
    trigger: WorkflowTriggerType;
    steps: WorkflowStep[];
  };
  templates: TemplateChoice[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState(workflow.name);
  const [description, setDescription] = React.useState(workflow.description ?? "");
  const [trigger, setTrigger] = React.useState<WorkflowTriggerType>(workflow.trigger);
  const [steps, setSteps] = React.useState<Keyed[]>(() => workflow.steps.map(keyed));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const subject = SUBJECTS[TRIGGERS[trigger].subject];
  const problem = workflowProblem(trigger, steps.map(strip), templates);

  const update = (key: string, next: WorkflowStep) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...next, key } : s)));
  const remove = (key: string) => setSteps((prev) => prev.filter((s) => s.key !== key));
  const move = (index: number, by: -1 | 1) =>
    setSteps((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });

  function add(type: WorkflowStep["type"]) {
    const firstTemplate = templates[0];
    const step: WorkflowStep =
      type === "WAIT"
        ? { type: "WAIT", duration: { hours: 2 } }
        : type === "CONDITION"
          ? { type: "CONDITION", field: subject.fields[0].path, operator: "IS_PRESENT" }
          : firstTemplate
            ? { type: "ACTION", action: "SEND_MESSAGE", templateKey: firstTemplate.key, channel: firstTemplate.channel }
            : { type: "ACTION", action: "NOTIFY_STAFF", title: "" };
    setSteps((prev) => [...prev, keyed(step)]);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveWorkflowAction({
        id: workflow.id,
        name,
        description: description || null,
        trigger,
        steps: steps.map(strip),
      });
      if (result.ok) {
        toast.success(result.message ?? "Saved.", {
          description: workflow.id ? undefined : "It starts switched off — turn it on when you are ready.",
        });
        router.push("/admin/communications");
        router.refresh();
      } else {
        setError([result.message, result.action].filter(Boolean).join(" "));
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card className="grid gap-3 p-5 sm:grid-cols-2">
          <Field id="w-name" label="Name">
            <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <Field id="w-trigger" label="When">
            <Select value={trigger} onValueChange={(v) => setTrigger(v as WorkflowTriggerType)}>
              <SelectTrigger id="w-trigger"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGERS).map(([value, t]) => (
                  <SelectItem key={value} value={value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field id="w-desc" label="Description">
              <Input id="w-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} placeholder="What it does, for the next person who reads it" />
            </Field>
          </div>
        </Card>

        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.key}>
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <StepBadge type={step.type} />
                  <span className="text-[12px] font-semibold text-muted-foreground">
                    Step {index + 1}
                  </span>
                  <span className="ml-auto flex gap-0.5">
                    <Button variant="ghost" size="icon-sm" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Move step ${index + 1} down`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove step ${index + 1}`} onClick={() => remove(step.key)}><Trash2 /></Button>
                  </span>
                </div>
                {step.type === "WAIT" && (
                  <WaitFields step={step} anchors={subject.anchors} onChange={(s) => update(step.key, s)} />
                )}
                {step.type === "CONDITION" && (
                  <ConditionFields step={step} fields={subject.fields} onChange={(s) => update(step.key, s)} />
                )}
                {step.type === "ACTION" && (
                  <ActionFields
                    step={step}
                    templates={templates}
                    visitActions={subject.needsVisitActions}
                    fillable={new Set([...subject.variables, ...(subject.sometimes ?? [])])}
                    onChange={(s) => update(step.key, s)}
                  />
                )}
              </Card>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => add("WAIT")}><Clock3 />Wait</Button>
          <Button variant="outline" size="sm" onClick={() => add("CONDITION")}><GitBranch />Only if…</Button>
          <Button variant="outline" size="sm" onClick={() => add("ACTION")}><Play />Action</Button>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <p className="text-[12px] font-mediumr text-muted-foreground">
            In plain words
          </p>
          <ol className="mt-3 space-y-2">
            <li className="flex items-start gap-2 text-[13px] font-semibold">
              <StepBadge type="TRIGGER" />
              {TRIGGERS[trigger].label}
            </li>
            {steps.map((step, index) => (
              <li key={step.key} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                <StepBadge type={step.type} />
                <span>
                  {index + 1}. {describeStep(strip(step))}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        {(error || problem) && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error ?? problem}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => router.push("/admin/communications")}>Cancel</Button>
          <Button variant="accent" onClick={save} disabled={pending || !name.trim() || problem !== null}>
            {pending && <LoaderCircle className="animate-spin" />}
            Save workflow
          </Button>
        </div>
      </div>
    </div>
  );
}

function WaitFields({
  step,
  anchors,
  onChange,
}: {
  step: WaitStep;
  anchors: readonly string[];
  onChange: (step: WaitStep) => void;
}) {
  const unit = step.duration?.days ? "days" : step.duration?.minutes ? "minutes" : "hours";
  const amount = step.duration?.[unit] ?? 1;
  const mode = step.until ? step.until : "duration";

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        value={mode}
        onValueChange={(v) =>
          onChange(
            v === "duration"
              ? { type: "WAIT", duration: { hours: 2 } }
              : { type: "WAIT", until: v as WaitStep["until"] },
          )
        }
      >
        <SelectTrigger className="w-64" aria-label="Wait for"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="duration">A fixed time</SelectItem>
          {anchors.map((a) => (
            <SelectItem key={a} value={a}>{ANCHOR_LABEL[a]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mode === "duration" && (
        <>
          <Input
            type="number"
            min={1}
            className="w-24"
            aria-label="How long"
            value={amount}
            onChange={(e) =>
              onChange({ type: "WAIT", duration: { [unit]: Math.max(1, Number(e.target.value) || 1) } })
            }
          />
          <Select value={unit} onValueChange={(u) => onChange({ type: "WAIT", duration: { [u]: amount } })}>
            <SelectTrigger className="w-32" aria-label="Unit"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">minutes</SelectItem>
              <SelectItem value="hours">hours</SelectItem>
              <SelectItem value="days">days</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  );
}

function ConditionFields({
  step,
  fields,
  onChange,
}: {
  step: ConditionStep;
  fields: (typeof SUBJECTS)[keyof typeof SUBJECTS]["fields"];
  onChange: (step: ConditionStep) => void;
}) {
  const field = fields.find((f) => f.path === step.field) ?? fields[0];
  const operators =
    field.kind === "text"
      ? (["IS_PRESENT", "IS_ABSENT", "EQUALS", "NOT_EQUALS"] as const)
      : (["EQUALS", "NOT_EQUALS"] as const);
  const opLabel: Record<string, string> = {
    IS_PRESENT: "is filled in",
    IS_ABSENT: "is empty",
    EQUALS: "is",
    NOT_EQUALS: "is not",
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        value={field.path}
        onValueChange={(path) => {
          const next = fields.find((f) => f.path === path)!;
          onChange(
            next.kind === "boolean"
              ? { type: "CONDITION", field: path, operator: "EQUALS", value: true }
              : next.kind === "choice"
                ? { type: "CONDITION", field: path, operator: "EQUALS", value: next.choices![0] }
                : { type: "CONDITION", field: path, operator: "IS_PRESENT" },
          );
        }}
      >
        <SelectTrigger className="w-64" aria-label="Field"><SelectValue /></SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.path} value={f.path}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={operators.includes(step.operator as never) ? step.operator : operators[0]}
        onValueChange={(op) => onChange({ ...step, operator: op as ConditionStep["operator"] })}
      >
        <SelectTrigger className="w-36" aria-label="Test"><SelectValue /></SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op} value={op}>{opLabel[op]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field.kind === "boolean" && (
        <Select value={String(step.value ?? true)} onValueChange={(v) => onChange({ ...step, value: v === "true" })}>
          <SelectTrigger className="w-24" aria-label="Value"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">yes</SelectItem>
            <SelectItem value="false">no</SelectItem>
          </SelectContent>
        </Select>
      )}
      {field.kind === "choice" && (
        <Select value={String(step.value ?? field.choices![0])} onValueChange={(v) => onChange({ ...step, value: v })}>
          <SelectTrigger className="w-48" aria-label="Value"><SelectValue /></SelectTrigger>
          <SelectContent>
            {field.choices!.map((c) => (
              <SelectItem key={c} value={c}>{c.toLowerCase().replaceAll("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field.kind === "text" && (step.operator === "EQUALS" || step.operator === "NOT_EQUALS") && (
        <Input
          className="w-48"
          aria-label="Value"
          value={String(step.value ?? "")}
          onChange={(e) => onChange({ ...step, value: e.target.value })}
        />
      )}
    </div>
  );
}

function ActionFields({
  step,
  templates,
  visitActions,
  fillable,
  onChange,
}: {
  step: ActionStep;
  templates: TemplateChoice[];
  visitActions: boolean;
  fillable: Set<string>;
  onChange: (step: ActionStep) => void;
}) {
  const actions = (Object.keys(ACTION_LABEL) as ActionStep["action"][]).filter(
    (a) => visitActions || (a !== "CREATE_FEEDBACK_RECORD" && a !== "CREATE_FOLLOW_UP") || a === step.action,
  );
  const templateValue = step.templateKey && step.channel ? `${step.channel}:${step.templateKey}` : undefined;

  return (
    <div className="space-y-2">
      <Select
        value={step.action}
        onValueChange={(a) =>
          onChange(
            a === "SEND_MESSAGE" && templates[0]
              ? { type: "ACTION", action: "SEND_MESSAGE", templateKey: templates[0].key, channel: templates[0].channel }
              : a === "CREATE_FOLLOW_UP"
                ? { type: "ACTION", action: "CREATE_FOLLOW_UP", afterDays: 7, title: "Review" }
                : a === "NOTIFY_STAFF"
                  ? { type: "ACTION", action: "NOTIFY_STAFF", title: "" }
                  : { type: "ACTION", action: a as ActionStep["action"] },
          )
        }
      >
        <SelectTrigger className="w-64" aria-label="Action"><SelectValue /></SelectTrigger>
        <SelectContent>
          {actions.map((a) => (
            <SelectItem key={a} value={a}>{ACTION_LABEL[a]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {step.action === "SEND_MESSAGE" && (
        <Select
          value={templateValue}
          onValueChange={(v) => {
            const [channel, ...rest] = v.split(":");
            onChange({ ...step, channel: channel as ActionStep["channel"], templateKey: rest.join(":") });
          }}
        >
          <SelectTrigger className="w-full" aria-label="Template"><SelectValue placeholder="Choose a template" /></SelectTrigger>
          <SelectContent>
            {templates.map((t) => {
              const ok = t.placeholders.every((p) => fillable.has(p));
              return (
                <SelectItem key={`${t.channel}:${t.key}`} value={`${t.channel}:${t.key}`}>
                  {t.name} · {CHANNEL_LABEL[t.channel]}
                  {ok ? "" : " — needs details this trigger lacks"}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}

      {step.action === "CREATE_FOLLOW_UP" && (
        <div className="flex flex-wrap gap-2">
          <Input type="number" min={0} max={365} className="w-28" aria-label="Days after" value={step.afterDays ?? 7} onChange={(e) => onChange({ ...step, afterDays: Math.max(0, Number(e.target.value) || 0) })} />
          <span className="self-center text-[13px] text-muted-foreground">days later, for</span>
          <Input className="min-w-48 flex-1" aria-label="Reason" value={step.title ?? ""} onChange={(e) => onChange({ ...step, title: e.target.value })} placeholder="Review" maxLength={140} />
        </div>
      )}

      {step.action === "NOTIFY_STAFF" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label="Notification title" value={step.title ?? ""} onChange={(e) => onChange({ ...step, title: e.target.value })} placeholder="Title" maxLength={140} />
          <Input aria-label="Notification body" value={step.body ?? ""} onChange={(e) => onChange({ ...step, body: e.target.value })} placeholder="Details (optional)" maxLength={400} />
        </div>
      )}
    </div>
  );
}

function StepBadge({ type }: { type: "TRIGGER" | WorkflowStep["type"] }) {
  const { Icon, tone } = {
    TRIGGER: { Icon: Zap, tone: "bg-accent-soft text-brand-700" },
    WAIT: { Icon: Clock3, tone: "bg-muted text-muted-foreground" },
    CONDITION: { Icon: GitBranch, tone: "bg-info-soft text-info" },
    ACTION: { Icon: Play, tone: "bg-success-soft text-success" },
  }[type];
  return (
    <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded", tone)} aria-hidden>
      <Icon className="size-3" />
    </span>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-[12px] font-semibold text-muted-foreground">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

