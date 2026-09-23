import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getOrganizationSettings } from "@/server/services/admin";

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <PageBody>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsScreen />
      </Suspense>
    </PageBody>
  );
}

function roleLabel(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

async function SettingsScreen() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.ADMIN_MANAGE)) {
    return (
      <NoAccess
        title="Settings"
        what="to manage organization settings"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const settings = await getOrganizationSettings(actor);

  return (
    <>
      <PageHeader
        title="Settings"
        description={`${settings.name} · ${settings.timezone} · ${settings.locale}`}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Patients" value={settings.counts.patients} />
        <Stat label="Staff accounts" value={settings.counts.users} />
        <Stat label="Departments" value={settings.counts.departments} />
      </div>

      {/* Spec §3 — where patients book and follow their token online. */}
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-[14px] font-semibold">Patient portal</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Patients sign in with a code sent to their mobile to book, cancel,
            follow their token and rate a visit. Share this address.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/portal/${settings.slug}`} target="_blank" rel="noopener">
            /portal/{settings.slug}
          </Link>
        </Button>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <Card className="p-0">
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2">
              <Building className="size-4 text-muted-foreground" />
              Facilities
            </CardTitle>
          </CardHeader>

          <ul className="divide-y divide-border">
            {settings.facilities.map((facility) => (
              <li key={facility.id} className="px-5 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold">{facility.name}</span>
                  <Badge variant="muted" className="font-mono">
                    {facility.code}
                  </Badge>
                  {!facility.active && <Badge variant="outline">Inactive</Badge>}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {[facility.city, facility.phone].filter(Boolean).join(" · ") ||
                    "No address on record"}
                  <span aria-hidden> · </span>
                  <span className="tabular">{facility.departmentCount}</span>{" "}
                  {facility.departmentCount === 1 ? "department" : "departments"}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-0">
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" />
              Roles and permissions
            </CardTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              What each role can actually do here, after this organization&rsquo;s
              overrides. The check that matters runs on the server — hiding a
              button is never the control.
            </p>
          </CardHeader>

          <ul className="divide-y divide-border">
            {settings.roles.map((role) => (
              <li key={role.role} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold">
                      {roleLabel(role.role)}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular">
                      {role.memberCount}{" "}
                      {role.memberCount === 1 ? "member" : "members"}
                    </span>
                  </p>
                  <span className="text-[12px] font-semibold tabular text-muted-foreground">
                    {role.held.length} permissions
                  </span>
                </div>

                {(role.added.length > 0 || role.removed.length > 0) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {role.added.map((permission) => (
                      <Badge key={permission} variant="success">
                        +{permission.toLowerCase().replace(/_/g, " ")}
                      </Badge>
                    ))}
                    {role.removed.map((permission) => (
                      <Badge key={permission} variant="destructive">
                        −{permission.toLowerCase().replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Spec §22 — tenancy stated where an administrator can read it. */}
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Every record in this product carries its organization, and every query
          is filtered by the one on your session. Nothing here can read or write
          another organization&rsquo;s data, and a record id from elsewhere
          simply does not resolve.
        </p>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tabular">{value}</p>
    </Card>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </>
  );
}
