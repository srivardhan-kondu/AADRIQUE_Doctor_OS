import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { homeFor } from "@/lib/nav";
import { requireActor } from "@/server/context";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Change password" };

export const dynamic = "force-dynamic";

/**
 * Spec §31 — changing a password. Outside the workspace shell on purpose: an
 * account holding a temporary password is sent here before anything else,
 * and cannot leave until it has chosen its own.
 */
export default async function ChangePasswordPage() {
  const actor = await requireActor();
  const forced = actor.mustChangePassword;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <Logo />
          <p className="font-display font-semibold">{actor.organizationName}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
          <h1 className="font-display text-xl font-bold tracking-tight">
            {forced ? "Choose your password" : "Change password"}
          </h1>
          <p className="mb-5 mt-1 text-[13px] text-muted-foreground">
            {forced
              ? `Welcome, ${actor.name}. You signed in with a temporary password — replace it with one only you know.`
              : `Signed in as ${actor.email}.`}
          </p>
          <PasswordForm forced={forced} />
        </div>
        {!forced && (
          <p className="mt-4 text-center text-[13px]">
            <Link href={homeFor(actor.role)} className="text-muted-foreground hover:text-foreground">
              Back to your workspace
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
