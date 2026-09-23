import { redirect } from "next/navigation";
import { homeFor } from "@/lib/nav";
import { getActor } from "@/server/context";

/** The root sends each person to their own workspace (spec §3). */
export default async function Home() {
  const actor = await getActor();
  redirect(actor ? homeFor(actor.role) : "/sign-in");
}
