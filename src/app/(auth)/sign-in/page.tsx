import type { Metadata } from "next";
import { Logo } from "@/components/shell/logo";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,44%)]">
      {/* Brand panel — navy, as the brochure's dark sections are. */}
      <section className="relative hidden flex-col justify-between bg-navy-900 p-12 text-navy-100 lg:flex">
        <div className="flex items-center gap-3">
          <Logo className="size-9" />
          <div className="leading-none">
            <p className="font-display text-base font-bold tracking-tight text-white">
              AADRIQUE
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-navy-400">
              Doctor OS
            </p>
          </div>
        </div>

        <div className="max-w-lg">
          <h1 className="font-display text-4xl font-bold leading-[1.15] tracking-tight text-white text-balance">
            Your OPD.
            <br />
            One intelligent workspace.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-navy-300">
            Appointments, queues, patient records, communication and AI
            assistance — designed around the way doctors actually work.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-navy-800 pt-8">
            {[
              { value: "1 click", label: "to your next patient" },
              { value: "One timeline", label: "for the whole patient story" },
              { value: "Live", label: "queue and OPD health" },
            ].map((item) => (
              <div key={item.label}>
                <dt className="font-display text-lg font-bold text-accent">
                  {item.value}
                </dt>
                <dd className="mt-1 text-[12px] leading-snug text-navy-400">
                  {item.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-[12px] text-navy-500">
          AADRIQUE Medical Center · Hyderabad
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo className="size-9" />
            <div className="leading-none">
              <p className="font-display text-base font-bold tracking-tight">
                AADRIQUE
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Doctor OS
              </p>
            </div>
          </div>

          <h2 className="font-display text-2xl font-bold tracking-tight">
            Sign in
          </h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Use your AADRIQUE Medical Center account.
          </p>

          <SignInForm next={next} />
        </div>
      </section>
    </div>
  );
}
