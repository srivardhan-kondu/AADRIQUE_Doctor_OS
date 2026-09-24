import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { checkResetToken } from "@/server/services/password-reset";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password" };

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const state = token ? await checkResetToken(token) : "invalid";

  if (state !== "valid") {
    return (
      <AuthCard
        title={state === "expired" ? "This link has expired" : "This link does not work"}
        description="Reset links work once, for 30 minutes."
      >
        <Link href="/forgot-password" className="text-[14px] underline underline-offset-4">
          Ask for a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <ResetForm token={token!} />
    </AuthCard>
  );
}
