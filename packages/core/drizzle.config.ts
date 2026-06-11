import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  // Migrations need a DIRECT (non-pooled) connection — PgBouncer transaction mode
  // can't run DDL. Use the unpooled URL for db:push; runtime uses the pooled one.
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
