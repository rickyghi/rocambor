/**
 * In-memory sliding-window rate limiter.
 *
 * Each instance tracks request timestamps per key (typically client IP).
 * Requests outside the sliding window are pruned on every `check()` call,
 * and a background interval evicts keys that haven't been seen recently.
 */

export interface RateLimitConfig {
  /** Window duration in milliseconds (e.g. 60_000 = 1 minute). */
  windowMs: number;
  /** Maximum requests allowed within the window. */
  maxRequests: number;
}

export class RateLimiter {
  private windows = new Map<string, number[]>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private config: RateLimitConfig) {
    // Evict stale entries every 5 minutes to bound memory.
    this.cleanupInterval = setInterval(() => this.cleanup(), 300_000);
    this.cleanupInterval.unref(); // Don't keep process alive
  }

  /**
   * Returns `true` if the request is allowed, `false` if rate-limited.
   * Each allowed call records a timestamp for the given key.
   */
  check(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;

    let timestamps = this.windows.get(key);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(key, timestamps);
    }

    // Prune expired entries from front of sorted array
    while (timestamps.length > 0 && timestamps[0]! <= cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this.config.maxRequests) {
      return false;
    }

    timestamps.push(now);
    return true;
  }

  /** Seconds until the oldest request in the window expires (for Retry-After). */
  retryAfterSecs(key: string): number {
    const timestamps = this.windows.get(key);
    if (!timestamps || timestamps.length === 0) return 0;
    const oldest = timestamps[0]!;
    const expiresAt = oldest + this.config.windowMs;
    return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1_000));
  }

  /** Remove keys whose latest timestamp is older than the window. */
  private cleanup(): void {
    const cutoff = Date.now() - this.config.windowMs;
    for (const [key, timestamps] of this.windows) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1]! <= cutoff) {
        this.windows.delete(key);
      }
    }
  }

  /** Stop the background cleanup interval. */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.windows.clear();
  }

  /** Number of tracked keys (for testing / monitoring). */
  get size(): number {
    return this.windows.size;
  }
}

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return new RateLimiter(config);
}
