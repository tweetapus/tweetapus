import { defineConfig } from "drizzle-kit";
import { join } from "path";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "/Users/tiago/Desktop/code/tweetapus/v2/apps/api/.data/db.sqlite",
  },
  verbose: true,
  strict: true,
});
