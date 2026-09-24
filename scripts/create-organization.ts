import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "@/lib/db";
import { createOrganization } from "@/server/setup/create-organization";
import { MEDICATIONS } from "../prisma/seed-data";

/**
 * Sets up a real clinic (spec §18). Unlike the demo seed it deletes nothing,
 * and refuses a slug or admin email that is already in use.
 *
 *   npm run org:create -- \
 *     --name "Sunrise Clinics" --slug sunrise \
 *     --facility "Sunrise Clinic, Kondapur" --code SUN-KDP \
 *     --city Hyderabad --phone "040 4000 1234" \
 *     --admin-name "Priya Menon" --admin-email priya@sunrise.example
 *
 * Prints the admin's one-time password once. Hand it over in person; they
 * choose their own at first sign-in.
 */

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    slug: { type: "string" },
    facility: { type: "string" },
    code: { type: "string" },
    city: { type: "string" },
    phone: { type: "string" },
    department: { type: "string" },
    "admin-name": { type: "string" },
    "admin-email": { type: "string" },
  },
});

async function main() {
  const required = ["name", "slug", "facility", "code", "admin-name", "admin-email"] as const;
  const missing = required.filter((key) => !values[key]);
  if (missing.length > 0) {
    console.error(`Missing ${missing.map((m) => `--${m}`).join(", ")}. See the usage at the top of scripts/create-organization.ts.`);
    process.exit(1);
  }

  const result = await createOrganization({
    name: values.name!,
    slug: values.slug!,
    facilityName: values.facility!,
    facilityCode: values.code!,
    city: values.city,
    phone: values.phone,
    department: values.department,
    adminName: values["admin-name"]!,
    adminEmail: values["admin-email"]!,
  });

  // The medicine catalogue is shared by every clinic; load it the first time.
  const loaded = await prisma.medication.createMany({ data: MEDICATIONS, skipDuplicates: true });

  console.log(`
Created ${values.name} (${values.slug}).

  Admin sign-in       ${result.adminEmail}
  One-time password   ${result.temporaryPassword}
  Patient portal      ${process.env.APP_URL ?? ""}${result.portalPath}
${loaded.count > 0 ? `  Medicine catalogue  ${loaded.count} medicines loaded\n` : ""}
Next: the admin signs in, sets a password, then adds doctors and staff under
Admin → Doctors and Admin → Staff, and connects WhatsApp, SMS and email under
Admin → Integrations (messages are simulated until then).
`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
