import { getRedis } from "./redis";

export type Mode = "tresillo" | "quadrille";

export class Lobby {
  async joinQueue(clientId: string, mode: Mode){
    const redis = getRedis();
    if (!redis) return { queued: false, note: "redis not configured" };
    
    try {
      const key = `queue:${mode}`;
      await redis.lpush(key, clientId);
      const need = mode === "tresillo" ? 3 : 4;
      const len = await redis.llen(key);
      
      if (len >= need){
        const ids: string[] = [];
        for (let i = 0; i < need; i++) { 
          const v = await redis.rpop(key); 
          if (v) ids.push(v); 
        }
        return { ready: true, clients: ids };
      }
      
      return { queued: true, size: len };
    } catch (error) {
      console.error("[lobby] Redis operation failed:", error);
      return { queued: false, note: "queue operation failed" };
    }
  }
}