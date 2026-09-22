import { redirect } from "next/navigation";

/**
 * Part 1 sends the root straight into the doctor workspace. The public demo
 * entry described in spec §40 is built once there is seeded data to walk
 * through.
 */
export default function Home() {
  redirect("/doctor");
}
