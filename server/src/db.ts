import { Client } from "pg";

export let db: Client | null = null;

function attachDBErrorHandler(client: Client): void {
  client.on("error", (err) => {
    console.error("[db] Connection error; disabling persistence until restart:", err);
    if (db === client) {
      db = null;
    }
  });
}

export async function initDB(): Promise<void> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.warn("[db] No DATABASE_URL; starting without persistence");
    return;
  }
  try {
    const client = new Client({
      connectionString: url,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
    });
    attachDBErrorHandler(client);
    await client.connect();
    await client.query("SELECT 1");
    db = client;
    console.log("[db] Connected");
  } catch (err) {
    console.error("[db] Connection failed, continuing without DB:", err);
    db = null;
  }
}

export async function closeDB(): Promise<void> {
  if (!db) return;
  const client = db;
  db = null;
  try {
    await client.end();
    console.log("[db] Closed");
  } catch (e) {
    console.error("[db] Close error:", e);
  }
}
