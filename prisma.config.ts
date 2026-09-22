import "dotenv/config";
import { defineConfig, env } from "prisma/config";

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
    url: env("DIRECT_DATABASE_URL"),
  },
});
