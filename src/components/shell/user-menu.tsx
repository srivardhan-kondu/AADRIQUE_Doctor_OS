"use client";

import { useRouter } from "next/navigation";
import {
  ChevronDown,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  UserCog,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/session";
import { signOutAction } from "@/lib/auth/actions";
import { useMounted } from "@/hooks/use-mounted";
import type { Role } from "@/types";

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HOSPITAL_ADMIN: "Hospital Admin",
  DOCTOR: "Doctor",
  NURSE: "Nurse",
  RECEPTIONIST: "Receptionist",
  STAFF: "Staff",
  PATIENT: "Patient",
};

export function UserMenu() {
  const user = useSession();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const mounted = useMounted();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-muted">
        <span className="relative">
          <Avatar className="size-8">
            <AvatarImage src={user.avatarUrl} alt="" />
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          {/* Spec §5.1 — online status is part of the doctor's identity block. */}
          <span
            aria-hidden
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background",
              user.online ? "bg-success" : "bg-muted-foreground",
            )}
          />
        </span>
        <span className="hidden min-w-0 flex-col items-start leading-tight xl:flex">
          <span className="max-w-[150px] truncate text-[13px] font-semibold">
            {user.name}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {ROLE_LABEL[user.role]}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="sr-only">Open account menu</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-64">
        <div className="px-2.5 py-2">
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {user.email}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {user.department ? `${user.department} · ` : ""}
            {user.facility}
          </p>
          <Badge variant="muted" className="mt-2">
            {ROLE_LABEL[user.role]}
          </Badge>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => router.push("/doctor/profile")}>
          <UserCog />
          Profile & availability
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/admin/settings")}>
          <Settings />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mounted ? theme : undefined}
          onValueChange={setTheme}
        >
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4 text-muted-foreground" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4 text-muted-foreground" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4 text-muted-foreground" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <form action={signOutAction}>
          <button type="submit" className="w-full">
            <DropdownMenuItem variant="destructive" asChild>
              <span>
                <LogOut />
                Sign out
              </span>
            </DropdownMenuItem>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
