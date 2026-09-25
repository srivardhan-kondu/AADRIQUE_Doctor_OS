import Link from "next/link";
import { Logo } from "@/components/shell/logo";

/** The narrow, centred frame the account-recovery pages share. */
export function AuthCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/sign-in" className="mb-8 flex items-center gap-3">
          <Logo className="size-9" />
          <span className="leading-none">
            <span className="block text-base font-semibold tracking-[0.02em]">AADRIQUE</span>
            <span className="mt-1 block font-display text-[13px] italic text-muted-foreground">
              Doctor OS
            </span>
          </span>
        </Link>
        <h1 className="font-display text-[32px] font-normal leading-tight">{title}</h1>
        {description && <p className="mt-1.5 text-[14px] text-muted-foreground">{description}</p>}
        <div className="mt-7">{children}</div>
      </div>
    </main>
  );
}
