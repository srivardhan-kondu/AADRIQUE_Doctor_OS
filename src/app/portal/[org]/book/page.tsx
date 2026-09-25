import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PortalBooking } from "@/components/portal/portal-booking";
import { loadPortal } from "@/server/portal-session";
import { portalDoctors } from "@/server/services/portal";

export const dynamic = "force-dynamic";

export default async function PortalBookPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const loaded = await loadPortal(org);
  if (!loaded) notFound();
  if (!loaded.portal?.patient) redirect(`/portal/${org}`);

  const doctors = await portalDoctors(loaded.organization.id);

  return (
    <>
      <Link
        href={`/portal/${org}`}
        className="mb-4 inline-flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>
      <h1 className="mb-6 font-display text-2xl font-medium tracking-tight">Book an appointment</h1>
      {doctors.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">
          Online booking is not open yet. Please call the clinic.
        </p>
      ) : (
        <PortalBooking slug={org} doctors={doctors} />
      )}
    </>
  );
}
