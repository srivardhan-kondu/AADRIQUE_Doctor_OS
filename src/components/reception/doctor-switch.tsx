"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DoctorChoice } from "@/server/services/front-desk";

/**
 * Which doctor's schedule the desk is looking at. Kept in the URL, like the
 * date, so the view is a link and the back button works.
 */
export function DoctorSwitch({
  doctors,
  value,
}: {
  doctors: DoctorChoice[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams);
        params.set("doctor", next);
        router.replace(`${pathname}?${params}`, { scroll: false });
      }}
    >
      <SelectTrigger className="w-60" aria-label="Doctor">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {doctors.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.name}
            {d.department ? ` · ${d.department}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
