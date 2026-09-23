import type { Metadata } from "next";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NoAccess } from "@/components/shell/no-access";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { AddStaffDialog, StaffMenu } from "@/components/staff/staff-actions";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { listStaff } from "@/server/services/accounts";
import type { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Staff" };

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Platform owner",
  HOSPITAL_ADMIN: "Administrator",
  DOCTOR: "Doctor",
  NURSE: "Nurse",
  RECEPTIONIST: "Front desk",
  STAFF: "Staff",
  PATIENT: "Patient",
};

/**
 * Spec §21 — who can sign in to this organization, and as what. Access is
 * added, reset and removed here; every change is audited.
 */
export default async function StaffPage() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.ADMIN_MANAGE)) {
    return (
      <NoAccess
        title="Staff"
        what="to manage staff accounts"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const staff = await listStaff(actor);
  const active = staff.filter((s) => s.active).length;

  return (
    <PageBody>
      <PageHeader
        title="Staff"
        description={`${active} with access${staff.length > active ? ` · ${staff.length - active} removed` : ""}`}
        actions={<AddStaffDialog />}
      />

      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {staff.map((member) => (
            <li
              key={member.membershipId}
              className={`flex flex-wrap items-center gap-3 px-5 py-3 ${member.active ? "" : "opacity-60"}`}
            >
              <Avatar className="size-9 shrink-0">
                <AvatarFallback>{initials(member.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[14px] font-semibold">{member.name}</span>
                  {member.isSelf && <Badge variant="muted">You</Badge>}
                  {!member.active && <Badge variant="destructive">No access</Badge>}
                  {member.active && member.mustChangePassword && (
                    <Badge variant="warning">Temporary password</Badge>
                  )}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">{member.email}</p>
              </div>
              <Badge variant="outline" className="shrink-0">
                {ROLE_LABEL[member.role]}
              </Badge>
              <p className="hidden w-32 shrink-0 text-right text-[12px] text-muted-foreground sm:block">
                {member.lastLoginAt
                  ? `Signed in ${member.lastLoginAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                  : "Never signed in"}
              </p>
              <div className="w-8 shrink-0">
                {!member.isSelf && member.role !== "SUPER_ADMIN" && (
                  <StaffMenu userId={member.userId} name={member.name} active={member.active} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </PageBody>
  );
}
