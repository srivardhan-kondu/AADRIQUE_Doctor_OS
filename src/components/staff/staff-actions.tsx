"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  MoreHorizontal,
  UserMinus,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addStaffAction,
  resetPasswordAction,
  setActiveAction,
} from "@/app/(dashboard)/admin/staff/actions";

/** Shows a one-time password once, with a copy button. */
function OneTimePassword({ password }: { password: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="space-y-2 px-6">
      <p className="text-[13px]">
        Temporary password — hand it over in person. It is shown only once, and
        they will choose their own when they sign in.
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
  );
}

const ROLES = [
  { value: "RECEPTIONIST", label: "Front desk" },
  { value: "NURSE", label: "Nurse" },
  { value: "STAFF", label: "Staff (view only)" },
  { value: "HOSPITAL_ADMIN", label: "Administrator" },
] as const;

export function AddStaffDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    role: "RECEPTIONIST",
  });

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      setPassword(null);
      setForm({ name: "", email: "", role: "RECEPTIONIST" });
    }
  }

  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)}>
        <UserPlus />
        Add staff
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{password ? "Account created" : "Add a member of staff"}</DialogTitle>
            <DialogDescription>
              {password
                ? `${form.name} can sign in as ${form.email}.`
                : "Doctors are added from the Doctors page, where their hours are set."}
            </DialogDescription>
          </DialogHeader>

          {password ? (
            <OneTimePassword password={password} />
          ) : (
            <form
              id="add-staff"
              className="space-y-3 px-6"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                startTransition(async () => {
                  const result = await addStaffAction(form);
                  if (result.ok && result.temporaryPassword) {
                    setPassword(result.temporaryPassword);
                    router.refresh();
                  } else {
                    setError([result.message, result.action].filter(Boolean).join(" "));
                  }
                });
              }}
            >
              <div>
                <label htmlFor="staff-name" className="text-[12px] font-semibold text-muted-foreground">
                  Full name
                </label>
                <Input
                  id="staff-name"
                  className="mt-1.5"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={80}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="staff-email" className="text-[12px] font-semibold text-muted-foreground">
                  Email
                </label>
                <Input
                  id="staff-email"
                  type="email"
                  className="mt-1.5"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  maxLength={120}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="staff-role" className="text-[12px] font-semibold text-muted-foreground">
                  Role
                </label>
                <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                  <SelectTrigger id="staff-role" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive"
                >
                  {error}
                </p>
              )}
            </form>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{password ? "Done" : "Cancel"}</Button>
            </DialogClose>
            {!password && (
              <Button
                type="submit"
                form="add-staff"
                variant="accent"
                disabled={pending || !form.name.trim() || !form.email.trim()}
              >
                {pending && <LoaderCircle className="animate-spin" />}
                Add
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Reset a password, or remove and restore access — each confirmed first. */
export function StaffMenu({
  userId,
  name,
  active,
}: {
  userId: string;
  name: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [dialog, setDialog] = React.useState<"reset" | "access" | null>(null);
  const [password, setPassword] = React.useState<string | null>(null);

  function close() {
    setDialog(null);
    setPassword(null);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Manage ${name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {active && (
            <DropdownMenuItem onSelect={() => setDialog("reset")}>
              <KeyRound />
              Reset password
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant={active ? "destructive" : undefined}
            onSelect={() => setDialog("access")}
          >
            {active ? <UserMinus /> : <UserRoundCheck />}
            {active ? "Remove access" : "Restore access"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog === "reset"
                ? password
                  ? "Password reset"
                  : `Reset ${name}'s password?`
                : active
                  ? `Remove ${name}'s access?`
                  : `Restore ${name}'s access?`}
            </DialogTitle>
            <DialogDescription>
              {dialog === "reset"
                ? password
                  ? `${name} has been signed out on every device.`
                  : "They are signed out everywhere and get a temporary password to replace at their next sign-in."
                : active
                  ? "They are signed out and can no longer sign in here. Their records and history stay."
                  : "They can sign in again with their existing password."}
            </DialogDescription>
          </DialogHeader>

          {password && <OneTimePassword password={password} />}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{password ? "Done" : "Cancel"}</Button>
            </DialogClose>
            {!password && (
              <Button
                variant={dialog === "access" && active ? "destructive" : "accent"}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result =
                      dialog === "reset"
                        ? await resetPasswordAction(userId)
                        : await setActiveAction(userId, !active);
                    if (!result.ok) {
                      toast.error(result.message ?? "That did not work.", {
                        description: result.action,
                      });
                      return;
                    }
                    router.refresh();
                    if (result.temporaryPassword) {
                      setPassword(result.temporaryPassword);
                    } else {
                      toast.success(result.message ?? "Done.");
                      close();
                    }
                  })
                }
              >
                {pending && <LoaderCircle className="animate-spin" />}
                {dialog === "reset" ? "Reset password" : active ? "Remove access" : "Restore access"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
