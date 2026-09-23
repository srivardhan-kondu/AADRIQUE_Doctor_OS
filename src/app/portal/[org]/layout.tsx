import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patient portal",
  robots: { index: false, follow: false },
};

/** Spec §34 — patient-facing pages are mobile-first. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto w-full max-w-lg px-4 py-8">{children}</main>
    </div>
  );
}
