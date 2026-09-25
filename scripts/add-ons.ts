import "dotenv/config";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ADD_ONS, ADD_ON_KEYS, readAddOns, writeAddOns, type AddOn } from "@/lib/add-ons";

/**
 * Turns a clinic's add-ons on or off. AADRIQUE runs this — a clinic's own
 * administrators cannot, so nothing is unlocked that was not sold.
 *
 *   npm run org:add-ons -- <slug>                       show what is on
 *   npm run org:add-ons -- <slug> +analytics +aiCopilot  turn on
 *   npm run org:add-ons -- <slug> -messaging             turn off
 *   npm run org:add-ons -- <slug> +all | -all
 *
 * Add-ons: followUps, messaging, analytics, aiCopilot. Takes effect on the
 * clinic's next page load; nobody needs to sign out.
 */

async function main() {
  const [slug, ...changes] = process.argv.slice(2);
  if (!slug) {
    console.error("Usage: npm run org:add-ons -- <slug> [+addOn|-addOn|+all|-all ...]");
    process.exit(1);
  }

  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, modules: true },
  });
  if (!organization) {
    console.error(`No organization with slug "${slug}".`);
    process.exit(1);
  }

  const patch: Partial<Record<AddOn, boolean>> = {};
  for (const change of changes) {
    const on = change.startsWith("+");
    if (!on && !change.startsWith("-")) {
      console.error(`"${change}" should start with + (on) or - (off).`);
      process.exit(1);
    }
    const name = change.slice(1);
    const keys = name === "all" ? ADD_ON_KEYS : [name];
    for (const key of keys) {
      if (!(ADD_ON_KEYS as string[]).includes(key)) {
        console.error(`Unknown add-on "${key}". Add-ons: ${ADD_ON_KEYS.join(", ")}.`);
        process.exit(1);
      }
      patch[key as AddOn] = on;
    }
  }

  let state = readAddOns(organization.modules);
  if (changes.length > 0) {
    const modules = writeAddOns(organization.modules, patch);
    await prisma.organization.update({ where: { id: organization.id }, data: { modules: modules as Prisma.InputJsonValue } });
    state = readAddOns(modules);
  }

  console.log(organization.name);
  for (const key of ADD_ON_KEYS) {
    console.log(`  ${state[key] ? "on " : "off"}  ${key.padEnd(10)}  ${ADD_ONS[key].label}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
