import { Database } from "bun:sqlite";
import { join } from "path";

export async function initializeDatabase() {
  const dbPath =
    process.env.DATABASE_URL || join(process.cwd(), ".data", "db.sqlite");
  
  try {
    const sqlite = new Database(dbPath);
    // Just test the connection without creating tables
    // Let the Drizzle migrations handle table creation
    sqlite.query("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1").get();
    sqlite.close();
    console.log("Database connection established");
  } catch (error) {
    console.error("Database connection failed:", error);
    throw error;
  }
}
