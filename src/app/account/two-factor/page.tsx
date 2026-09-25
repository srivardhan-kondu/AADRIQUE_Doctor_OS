import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shell/logo";
import { homeFor } from "@/lib/nav";
import { requireActor } from "@/server/context";
import { getTwoFactorStatus } from "@/server/services/two-factor";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-factor sign-in" };

export const dynamic = "force-dynamic";

/** Spec §31 — a second factor for one's own account. */
export default async function TwoFactorPage() {
  const actor = await requireActor();
  if (actor.mustChangePassword) redirect("/account/password");
  const { enabled } = await getTwoFactorStatus(actor);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <Logo />
          <p className="font-display font-medium">{actor.organizationName}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
          <h1 className="mb-4 font-display text-xl font-medium tracking-tight">Two-factor sign-in</h1>
          <TwoFactorForm enabled={enabled} />
        </div>
        <p className="mt-4 text-center text-[13px]">
          <Link href={homeFor(actor.role)} className="text-muted-foreground hover:text-foreground">
            Back to your workspace
          </Link>
        </p>
      </div>
    </main>
  );
}
