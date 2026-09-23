"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bookAction, slotsAction } from "@/app/portal/[org]/actions";

/** Spec §3 — "appointment booking", in three taps on a phone. */

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function PortalBooking({
  slug,
  doctors,
}: {
  slug: string;
  doctors: { id: string; name: string; department: string | null; specialization: string | null }[];
}) {
  const router = useRouter();
  const [doctorId, setDoctorId] = React.useState(doctors[0]?.id ?? "");
  const [date, setDate] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return isoDate(d);
  });
  const [loaded, setLoaded] = React.useState<{ key: string; slots: string[] } | null>(null);
  const [slot, setSlot] = React.useState<{ key: string; start: string } | null>(null);
  const [reason, setReason] = React.useState("");
  const [loading, startLoading] = React.useTransition();
  const [booking, startBooking] = React.useTransition();

  const key = `${doctorId}:${date}`;
  const slots = loaded?.key === key ? loaded.slots : null;
  const chosen = slot?.key === key ? slot.start : null;

  React.useEffect(() => {
    if (!doctorId || !date) return;
    let stale = false;
    startLoading(async () => {
      const result = await slotsAction(slug, doctorId, date);
      if (!stale) setLoaded({ key, slots: result.ok ? (result.slots ?? []) : [] });
    });
    return () => {
      stale = true;
    };
  }, [slug, doctorId, date, key]);

  const today = new Date();
  const last = new Date();
  last.setDate(last.getDate() + 30);

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-[14px] font-medium">Doctor</legend>
        <div className="space-y-2">
          {doctors.map((d) => (
            <label
              key={d.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
                doctorId === d.id ? "border-accent bg-accent-soft/40" : "border-border bg-card hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="doctor"
                className="sr-only"
                checked={doctorId === d.id}
                onChange={() => setDoctorId(d.id)}
              />
              <span>
                <span className="block text-[15px] font-semibold">{d.name}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {[d.department, d.specialization].filter(Boolean).join(" · ")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="portal-date" className="text-[14px] font-medium">Day</label>
        <Input
          id="portal-date"
          type="date"
          value={date}
          min={isoDate(today)}
          max={isoDate(last)}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1.5 h-12 text-[16px]"
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-[14px] font-medium">Time</legend>
        {loading || slots === null ? (
          <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Finding free times…
          </p>
        ) : slots.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-3 text-[14px] text-muted-foreground">
            No free times that day. Try another day.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={chosen === s}
                onClick={() => setSlot({ key, start: s })}
                className={cn(
                  "h-11 rounded-lg border text-[14px] font-medium tabular-nums transition-colors",
                  chosen === s ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card hover:bg-muted",
                )}
              >
                {new Date(s).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <div>
        <label htmlFor="portal-reason" className="text-[14px] font-medium">
          What is it about? <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="portal-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={280}
          className="mt-1.5 h-12 text-[16px]"
          placeholder="Cough for a week"
        />
      </div>

      <Button
        size="lg"
        variant="accent"
        className="w-full"
        disabled={!chosen || booking}
        onClick={() =>
          chosen &&
          startBooking(async () => {
            const result = await bookAction(slug, { doctorId, start: chosen, reason });
            if (result.ok) {
              toast.success(result.message ?? "Booked.");
              router.push(`/portal/${slug}`);
              router.refresh();
            } else {
              toast.error(result.message ?? "Could not book.");
              setSlot(null);
              setLoaded(null);
            }
          })
        }
      >
        {booking && <LoaderCircle className="animate-spin" />}
        Book
      </Button>
    </div>
  );
}
