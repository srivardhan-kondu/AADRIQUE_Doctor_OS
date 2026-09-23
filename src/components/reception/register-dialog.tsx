"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LoaderCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useDialogState } from "@/hooks/use-dialog-state";
import { cn } from "@/lib/utils";
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
import {
  registerPatientAction,
  type RegisteredPatient,
  type RegisterInput,
} from "@/app/(dashboard)/reception/actions";

/**
 * Spec §13 — registration with only the fields that matter.
 *
 * Name, sex, age and a mobile number start a visit. Everything else is under
 * "More details" for when there is time, not a wall of fields in front of a
 * queue.
 */

const GENDERS = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "OTHER", label: "Other" },
  { value: "UNDISCLOSED", label: "Prefer not to say" },
] as const;

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
  { value: "ta", label: "Tamil" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
] as const;

export function RegisterPatientDialog({
  trigger,
  onRegistered,
  openParam,
}: {
  trigger?: React.ReactNode;
  /** Continue with the new patient — give them a token, or book them. */
  onRegistered?: (patient: RegisteredPatient) => void;
  /** Opens when the URL carries `?open=<openParam>` (see useDialogState). */
  openParam?: string;
}) {
  const [open, setOpen] = useDialogState(openParam);

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button variant="accent" onClick={() => setOpen(true)}>
          <UserPlus />
          Register patient
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          {open && (
            <RegisterForm
              onDone={(patient) => {
                setOpen(false);
                onRegistered?.(patient);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RegisterForm({
  onDone,
}: {
  onDone: (patient: RegisteredPatient) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [more, setMore] = React.useState(false);
  const [ageMode, setAgeMode] = React.useState<"age" | "dob">("age");

  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    gender: "" as RegisterInput["gender"] | "",
    age: "",
    dateOfBirth: "",
    phone: "",
    email: "",
    addressLine: "",
    city: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    whatsappOptIn: true,
    smsOptIn: true,
    emailOptIn: false,
    preferredLanguage: "en" as NonNullable<RegisterInput["preferredLanguage"]>,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const ready =
    form.firstName.trim() &&
    form.gender &&
    form.phone.trim() &&
    (ageMode === "age" ? form.age !== "" : form.dateOfBirth !== "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || !form.gender) return;
    setError(null);

    startTransition(async () => {
      const result = await registerPatientAction({
        firstName: form.firstName,
        lastName: form.lastName || undefined,
        gender: form.gender as RegisterInput["gender"],
        approximateAge: ageMode === "age" ? Number(form.age) : null,
        dateOfBirth: ageMode === "dob" ? form.dateOfBirth : undefined,
        phone: form.phone,
        email: form.email || undefined,
        addressLine: form.addressLine || undefined,
        city: form.city || undefined,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
        whatsappOptIn: form.whatsappOptIn,
        smsOptIn: form.smsOptIn,
        emailOptIn: form.emailOptIn && Boolean(form.email),
        preferredLanguage: form.preferredLanguage,
      });

      if (result.ok && result.patient) {
        toast.success(result.message ?? "Registered.");
        router.refresh();
        onDone(result.patient);
      } else {
        // Shown in the form, beside the fields, not only in a toast that
        // disappears while the receptionist is still reading it.
        setError(
          [result.message, result.action].filter(Boolean).join(" ") ||
            "The patient could not be registered.",
        );
      }
    });
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Register a patient</DialogTitle>
        <DialogDescription>
          They get a patient ID straight away. Only the first five fields are
          needed now.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[65dvh] space-y-4 overflow-y-auto px-6 pb-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="reg-first" required>
            <Input
              id="reg-first"
              autoFocus
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              maxLength={80}
              autoComplete="off"
            />
          </Field>
          <Field label="Last name" htmlFor="reg-last">
            <Input
              id="reg-last"
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              maxLength={80}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sex" htmlFor="reg-gender" required>
            <Select
              value={form.gender || undefined}
              onValueChange={(v) => set("gender", v as RegisterInput["gender"])}
            >
              <SelectTrigger id="reg-gender">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label={ageMode === "age" ? "Age in years" : "Date of birth"}
            htmlFor="reg-age"
            required
            aside={
              <button
                type="button"
                className="text-[11px] font-semibold text-accent hover:underline"
                onClick={() => setAgeMode(ageMode === "age" ? "dob" : "age")}
              >
                {ageMode === "age" ? "Use date of birth" : "Use age"}
              </button>
            }
          >
            {ageMode === "age" ? (
              <Input
                id="reg-age"
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
              />
            ) : (
              <Input
                id="reg-age"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label="Mobile number" htmlFor="reg-phone" required>
          <Input
            id="reg-phone"
            type="tel"
            inputMode="tel"
            placeholder="98765 43210"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            maxLength={20}
            autoComplete="off"
          />
        </Field>

        <fieldset>
          <legend className="text-[12px] font-semibold text-muted-foreground">
            May we message them?
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
            <Consent
              label="WhatsApp"
              checked={form.whatsappOptIn}
              onChange={(v) => set("whatsappOptIn", v)}
            />
            <Consent
              label="SMS"
              checked={form.smsOptIn}
              onChange={(v) => set("smsOptIn", v)}
            />
            <Consent
              label="Email"
              checked={form.emailOptIn}
              disabled={!form.email}
              onChange={(v) => set("emailOptIn", v)}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Appointment and token messages go only on the channels ticked here.
          </p>
        </fieldset>

        <button
          type="button"
          onClick={() => setMore(!more)}
          aria-expanded={more}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", more && "rotate-180")}
          />
          More details
        </button>

        {more && (
          <div className="space-y-3 border-l-2 border-border pl-4">
            <Field label="Email" htmlFor="reg-email">
              <Input
                id="reg-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                maxLength={120}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <Field label="Address" htmlFor="reg-address">
                <Input
                  id="reg-address"
                  value={form.addressLine}
                  onChange={(e) => set("addressLine", e.target.value)}
                  maxLength={200}
                />
              </Field>
              <Field label="City" htmlFor="reg-city">
                <Input
                  id="reg-city"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  maxLength={80}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Emergency contact" htmlFor="reg-ec-name">
                <Input
                  id="reg-ec-name"
                  value={form.emergencyContactName}
                  onChange={(e) => set("emergencyContactName", e.target.value)}
                  maxLength={80}
                />
              </Field>
              <Field label="Their mobile" htmlFor="reg-ec-phone">
                <Input
                  id="reg-ec-phone"
                  type="tel"
                  value={form.emergencyContactPhone}
                  onChange={(e) => set("emergencyContactPhone", e.target.value)}
                  maxLength={20}
                />
              </Field>
            </div>
            <Field label="Preferred language" htmlFor="reg-lang">
              <Select
                value={form.preferredLanguage}
                onValueChange={(v) =>
                  set("preferredLanguage", v as typeof form.preferredLanguage)
                }
              >
                <SelectTrigger id="reg-lang" className="sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

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
          Register
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[12px] font-semibold text-muted-foreground"
        >
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>
        {aside}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Consent({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 text-[13px]",
        disabled && "text-muted-foreground",
      )}
    >
      <input
        type="checkbox"
        className="size-4 accent-[var(--accent)]"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
