import { redirect } from "next/navigation";

/** Operations is now the admin Overview; old links and bookmarks land there. */
export default function OperationsPage() {
  redirect("/admin");
}
