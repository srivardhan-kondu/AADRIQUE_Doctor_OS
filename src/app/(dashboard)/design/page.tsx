import type { Metadata } from "next";
import { CalendarClock, Inbox, Sparkles, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, labelForFlowStage, toneForFlowStage } from "@/components/ui/status";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import type { PatientFlowStage } from "@/types";

export const metadata: Metadata = { title: "Design System" };

const FLOW_STAGES: PatientFlowStage[] = [
  "REGISTERED",
  "WAITING",
  "VITALS",
  "WITH_DOCTOR",
  "COMPLETED",
  "FOLLOW_UP",
];

const SURFACES = [
  { name: "background", token: "bg-background", note: "Warm white page field" },
  { name: "card", token: "bg-card", note: "Raised clinical surface" },
  { name: "muted", token: "bg-muted", note: "Quiet fill and rows" },
  { name: "primary", token: "bg-primary", note: "Deep navy — structure" },
  { name: "accent", token: "bg-accent", note: "Brand orange — accent only" },
  { name: "ai", token: "bg-ai", note: "AI-generated content" },
];

const SEMANTICS = [
  { name: "success", token: "bg-success" },
  { name: "warning", token: "bg-warning" },
  { name: "destructive", token: "bg-destructive" },
  { name: "info", token: "bg-info" },
];

export default function DesignSystemPage() {
  return (
    <PageBody>
      <PageHeader
        title="Design System"
        description="The AADRIQUE token set, typography scale and component vocabulary every screen is built from. Switch appearance from the account menu to check both themes."
        actions={<Badge variant="outline">Part 1</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Surfaces</CardTitle>
              <CardDescription>
                Navy carries structure, warm white carries surface, orange stays
                an accent.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SURFACES.map((s) => (
                <div key={s.name}>
                  <div
                    className={`h-14 rounded-lg border border-border ${s.token}`}
                  />
                  <p className="mt-2 text-[12px] font-semibold">{s.name}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {s.note}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {SEMANTICS.map((s) => (
                <span key={s.name} className="flex items-center gap-1.5">
                  <span className={`size-3 rounded-full ${s.token}`} />
                  <span className="text-[12px] text-muted-foreground">
                    {s.name}
                  </span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Typography</CardTitle>
              <CardDescription>
                Plus Jakarta Sans for display, Inter for body, tabular figures
                for anything that ticks.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="font-display text-2xl font-bold tracking-tight">
              Your OPD. One intelligent workspace.
            </p>
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Appointments, queues, patient records, communication and AI
              assistance — designed around the way doctors actually work.
            </p>
            <div className="flex items-end gap-6 border-t border-border pt-4">
              <div>
                <p data-numeric className="font-display text-3xl font-bold">
                  32
                </p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Patients today
                </p>
              </div>
              <div>
                <p data-numeric className="font-display text-3xl font-bold">
                  08 min
                </p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Average wait
                </p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold">A018</p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Token
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Clinical status</CardTitle>
              <CardDescription>
                One colour vocabulary, shared by the queue, schedule and
                timeline.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {FLOW_STAGES.map((stage) => (
                <StatusChip
                  key={stage}
                  tone={toneForFlowStage(stage)}
                  label={labelForFlowStage(stage)}
                  live={stage === "WITH_DOCTOR"}
                />
              ))}
              <StatusChip tone="no-show" label="No show" />
              <StatusChip tone="cancelled" label="Cancelled" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Actions</CardTitle>
              <CardDescription>
                Navy for primary intent, orange for the one action that matters
                most on a screen.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button>Sign consultation</Button>
              <Button variant="accent">Call next</Button>
              <Button variant="outline">Reschedule</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="destructive">Delete record</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ai" size="sm">
                <Sparkles />
                Draft note
              </Button>
              <Button variant="outline" size="sm">
                <UserPlus />
                New patient
              </Button>
              <Button variant="outline" size="sm">
                <CalendarClock />
                Book slot
              </Button>
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                Palette <Kbd>⌘K</Kbd> · Shortcuts <Kbd>?</Kbd>
              </span>
            </div>
            <Input placeholder="Search by name, mobile or patient ID" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>AI surface</CardTitle>
              <CardDescription>
                Generated content is always marked and always awaits review.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="ai-surface rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="ai">
                  <Sparkles />
                  AI generated
                </Badge>
                <Badge variant="outline">Doctor review required</Badge>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed">
                Follow-up consultation. Last visit 12 Sep 2026 with a
                prescription recorded and a follow-up requested. A recent lab
                report is available and has not been opened.
              </p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="ai">
                  Accept into note
                </Button>
                <Button size="sm" variant="outline">
                  Discard
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Empty and loading</CardTitle>
              <CardDescription>
                Useful empty states, and skeletons shaped like the real layout.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border">
              <EmptyState
                icon={Inbox}
                title="No patients waiting"
                description="Your queue is clear. Enjoy the breathing room."
                action={
                  <Button variant="outline" size="sm">
                    View today&apos;s appointments
                  </Button>
                }
              />
            </div>
            <div className="space-y-2.5 rounded-xl border border-border p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-14 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-md" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
