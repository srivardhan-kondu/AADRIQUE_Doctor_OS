import "dotenv/config";
import { execSync } from "node:child_process";

/**
 * Resets the demo organisation so every run starts from the same day.
 *
 * `npm run db:seed` deletes and rebuilds the demo data, so it only runs
 * against a database on this machine. Set E2E_ALLOW_REMOTE_RESET=1 to
 * override that deliberately, e.g. for a disposable CI database.
 */
export default function globalSetup() {
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";

  if (!local && process.env.E2E_ALLOW_REMOTE_RESET !== "1") {
    throw new Error(
      `E2E tests reset the demo data, and DATABASE_URL points at ${host || "an unknown host"}. ` +
        "Point it at a local database, or set E2E_ALLOW_REMOTE_RESET=1 if that database is disposable.",
    );
  }

  execSync("npm run db:seed", { stdio: "inherit" });
}
