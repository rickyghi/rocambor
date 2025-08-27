// Apply SQL migrations in src/migrations
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) { console.error("Missing DATABASE_URL/POSTGRES_URL"); process.exit(1); }
  const client = new Client({
    connectionString: url,
    ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined
  });
  await client.connect();
  const dir = path.join(__dirname, '..', 'src', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log("Applying", f);
    await client.query(sql);
  }
  await client.end();
  console.log("Migration complete");
})().catch(e => { console.error(e); process.exit(1); });
