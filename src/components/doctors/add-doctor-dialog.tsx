"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, LoaderCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDoctorAction } from "@/app/(dashboard)/admin/doctors/actions";

/**
 * Spec §53 (admin journey) — add a doctor, assign a department, then set
 * their hours. The temporary password is shown here once, to be handed over
 * in person; only its hash is stored.
 */
export function AddDoctorDialog({
  departments,
}: {
  departments: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)}>
        <UserPlus />
        Add doctor
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          {open && <AddDoctorForm departments={departments} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddDoctorForm({
  departments,
}: {
  departments: { id: string; name: string }[];
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<{
    doctorId: string;
    message: string;
    password: string;
  } | null>(null);
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    departmentId: departments[0]?.id ?? "",
    specialization: "",
    qualifications: "",
    registrationNo: "",
    consultationMinutes: "15",
    tokenPrefix: "",
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const ready =
    form.name.trim() && form.email.trim() && form.departmentId && form.tokenPrefix.trim();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setError(null);

    startTransition(async () => {
      const result = await createDoctorAction({
        name: form.name,
        email: form.email.trim(),
        departmentId: form.departmentId,
        specialization: form.specialization || undefined,
        qualifications: form.qualifications || undefined,
        registrationNo: form.registrationNo || undefined,
        consultationMinutes: Number(form.consultationMinutes),
        tokenPrefix: form.tokenPrefix,
      });

      if (result.ok && result.doctorId && result.temporaryPassword) {
        setCreated({
          doctorId: result.doctorId,
          message: result.message ?? "Doctor added.",
          password: result.temporaryPassword,
        });
      } else {
        setError([result.message, result.action].filter(Boolean).join(" "));
      }
    });
  }

  if (created) {
    return <Created {...created} />;
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Add a doctor</DialogTitle>
        <DialogDescription>
          They get an account to sign in with. Set their clinic hours next so
          they can be booked.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[65dvh] space-y-3 overflow-y-auto px-6 pb-1">
        <Field id="doc-name" label="Full name" required>
          <Input
            id="doc-name"
            autoFocus
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Dr. Priya Menon"
            maxLength={80}
          />
        </Field>
        <Field id="doc-email" label="Email" required>
          <Input
            id="doc-email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            maxLength={120}
            autoComplete="off"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field id="doc-dept" label="Department" required>
            <Select
              value={form.departmentId}
              onValueChange={(v) => set("departmentId", v)}
            >
              <SelectTrigger id="doc-dept">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="doc-prefix" label="Token prefix" required>
            <Input
              id="doc-prefix"
              value={form.tokenPrefix}
              onChange={(e) => set("tokenPrefix", e.target.value.toUpperCase())}
              placeholder="D"
              maxLength={3}
              className="font-mono uppercase"
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="doc-spec" label="Specialization">
            <Input
              id="doc-spec"
              value={form.specialization}
              onChange={(e) => set("specialization", e.target.value)}
              maxLength={80}
            />
          </Field>
          <Field id="doc-slot" label="Consultation slot">
            <Select
              value={form.consultationMinutes}
              onValueChange={(v) => set("consultationMinutes", v)}
            >
              <SelectTrigger id="doc-slot">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 15, 20, 30, 45, 60].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="doc-quals" label="Qualifications">
            <Input
              id="doc-quals"
              value={form.qualifications}
              onChange={(e) => set("qualifications", e.target.value)}
              placeholder="MBBS, MD"
              maxLength={120}
            />
          </Field>
          <Field id="doc-reg" label="Registration no.">
            <Input
              id="doc-reg"
              value={form.registrationNo}
              onChange={(e) => set("registrationNo", e.target.value)}
              maxLength={40}
            />
          </Field>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive"
          >
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="accent" disabled={pending || !ready}>
          {pending && <LoaderCircle className="animate-spin" />}
          Add doctor
        </Button>
      </DialogFooter>
    </form>
  );
}

function Created({
  doctorId,
  message,
  password,
}: {
  doctorId: string;
  message: string;
  password: string;
}) {
  const [copied, setCopied] = React.useState(false);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Doctor added</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 px-6">
        <p className="text-[13px]">
          Temporary password — hand it over in person. It is shown only once.
        </p>
        <div className="flex items-center gap-2">
          <code
            data-testid="temporary-password"
            className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-[15px] tracking-wider"
          >
            {password}
          </code>
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy password"
            onClick={() => {
              void navigator.clipboard?.writeText(password);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Done</Button>
        </DialogClose>
        <Button asChild variant="accent">
          <Link href={`/admin/doctors/${doctorId}`}>Set clinic hours</Link>
        </Button>
      </DialogFooter>
    </>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[12px] font-semibold text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
