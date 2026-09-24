import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations use the DIRECT endpoint. Neon's pooler will accept DDL, but
    // schema changes should not share a pooled connection with app traffic.
    // The application itself connects over the pooled DATABASE_URL — see
    // src/lib/db/client.ts.
    // Falls back so `prisma generate` (run on install, e.g. in a Vercel
    // build) works without database settings; it never connects.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
});
