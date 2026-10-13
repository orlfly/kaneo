// In-process migration run mirroring apps/api/src/index.ts startup path.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabase } from "../src/database";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const currentDir = dirname(fileURLToPath(import.meta.url));
try {
  await migrate(getDatabase(), {
    migrationsFolder: `${currentDir}/../drizzle`,
  });
  console.log("MIGRATE_OK");
} catch (err) {
  console.log("MIGRATE_FAILED:", (err as Error).message);
  process.exit(1);
}
process.exit(0);