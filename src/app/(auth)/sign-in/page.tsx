import type { Metadata } from "next";
import { Logo } from "@/components/shell/logo";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ended?: string }>;
}) {
  const { next, ended } = await searchParams;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,44%)]">
      {/* Brand panel — warm honey light, inset on the paper like a printed
          card, so the first screen reads as a clinic's, not a template's. */}
      <section className="relative m-3 hidden flex-col justify-between overflow-hidden rounded-[28px] brand-panel p-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-white/35 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <Logo className="size-9" />
          <div className="leading-none">
            <p className="text-base font-semibold tracking-[0.02em]">
              AADRIQUE
            </p>
            <p className="mt-1 font-display text-[13px] italic text-panel-muted">
              Doctor OS
            </p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="font-display text-5xl font-normal leading-[1.08] text-balance">
            Your OPD.
            <br />
            <em className="text-panel-emphasis">One intelligent workspace.</em>
          </h1>
          <p className="mt-6 text-[15px] leading-relaxed text-panel-muted">
            Appointments, queues, patient records, communication and AI
            assistance — designed around the way doctors actually work.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-panel-ink/15 pt-8">
            {[
              { value: "1 click", label: "to your next patient" },
              { value: "One timeline", label: "for the whole patient story" },
              { value: "Live", label: "queue and OPD health" },
            ].map((item) => (
              <div key={item.label}>
                <dt className="font-display text-xl font-normal">
                  {item.value}
                </dt>
                <dd className="mt-1 text-[12px] leading-snug text-panel-muted">
                  {item.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-[12px] text-panel-muted">
          AADRIQUE Doctor OS
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo className="size-9" />
            <div className="leading-none">
              <p className="text-base font-semibold tracking-[0.02em]">
                AADRIQUE
              </p>
              <p className="mt-1 font-display text-[13px] italic text-muted-foreground">
                Doctor OS
              </p>
            </div>
          </div>

          <h2 className="font-display text-[32px] font-normal leading-tight">
            Sign in
          </h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Use the account your clinic gave you.
          </p>

          {ended && (
            // Said plainly, so a person signed out by a password reset or a
            // change to their access knows it was deliberate, not a fault.
            <p
              role="status"
              className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] text-warning"
            >
              You were signed out because your password or your access changed.
              Sign in again to continue.
            </p>
          )}

          <SignInForm
            next={next}
            demo={process.env.DEMO_MODE === "true"}
          />
        </div>
      </section>
    </div>
  );
}
