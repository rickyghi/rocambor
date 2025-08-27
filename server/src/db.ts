import { Client } from "pg";
export let db: Client | null = null;

export async function initDB() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.warn("[db] No DATABASE_URL; starting without persistence");
    return;
  }
  try {
    db = new Client({
      connectionString: url,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
    });
    await db.connect();
    await db.query("select 1");
    console.log("[db] Connected");
  } catch (err) {
    console.error("[db] Connection failed, continuing without DB:", err);
    db = null;
  }
}

export async function closeDB() {
  if (!db) return;
  try { await db.end(); console.log("[db] Closed"); } 
  catch (e) { console.error("[db] Close error:", e); }
  db = null;
}
