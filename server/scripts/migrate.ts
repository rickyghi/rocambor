import { Client } from "pg";
import fs from "fs";
import path from "path";

async function migrate(): Promise<void> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.error("No DATABASE_URL set");
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  try {
    await client.connect();

    const migrationsDirCandidates = [
      path.join(__dirname, "..", "migrations"),
      path.resolve(__dirname, "..", "..", "..", "migrations"),
    ];
    const migrationsDir = migrationsDirCandidates.find((candidate) => fs.existsSync(candidate));
    if (!migrationsDir) {
      throw new Error(`No migrations directory found. Checked: ${migrationsDirCandidates.join(", ")}`);
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      console.log(`  Done: ${file}`);
    }

    console.log("All migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
