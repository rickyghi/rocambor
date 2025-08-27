import IORedis from "ioredis";

export type MaybeRedis = IORedis | null;
let client: MaybeRedis = null;

export function getRedis(): MaybeRedis { 
  return client; 
}

export function initRedis() {
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  if (!url) {
    console.warn("[redis] No REDIS_URL; running without Redis");
    client = null;
    return;
  }
  
  try {
    client = new IORedis(url, { 
      lazyConnect: true, 
      maxRetriesPerRequest: 2,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null
    });
    
    client.on("error", (e) => {
      console.error("[redis] error:", e);
      client = null;
    });
    
    client.on("end", () => {
      console.warn("[redis] connection ended");
      client = null;
    });
    
    client.on("connect", () => {
      console.log("[redis] connected");
    });
    
    client.connect().catch(e => {
      console.error("[redis] initial connect failed:", e);
      client = null;
    });
  } catch (error) {
    console.error("[redis] initialization failed:", error);
    client = null;
  }
}

export async function closeRedis() {
  if (client) {
    try { 
      await client.quit(); 
      console.log("[redis] disconnected");
    } catch (error) {
      console.error("[redis] error during quit:", error);
    } finally {
      client = null;
    }
  }
}

// Export redis for lobby.ts - this will be updated when client changes
export { client as redis };