import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { db } from "./db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  console.log("Running migrations...");
  const migrationsPath = join(__dirname, "..", "migrations");
  await migrate(db, { migrationsFolder: migrationsPath });
  console.log("Migrations completed!");
  process.exit(0);
}

runMigrations().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
