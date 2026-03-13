import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter, createRateLimiter } from "../src/rate-limit";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    limiter?.destroy();
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(true);
  });

  it("rejects request that exceeds limit", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(false); // 4th request rejected
  });

  it("allows requests after window expires", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(60_001);

    expect(limiter.check("ip1")).toBe(true); // Allowed again
  });

  it("tracks different keys independently", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(false);
    expect(limiter.check("ip2")).toBe(true); // Different key, allowed
    expect(limiter.check("ip2")).toBe(false);
  });

  it("provides correct retryAfterSecs", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    limiter.check("ip1"); // t=0
    vi.advanceTimersByTime(10_000);
    limiter.check("ip1"); // t=10s
    limiter.check("ip1"); // rejected

    // Oldest request at t=0 expires at t=60s, so retry after ~50s
    const retryAfter = limiter.retryAfterSecs("ip1");
    expect(retryAfter).toBe(50);
  });

  it("returns 0 retryAfterSecs for unknown key", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 });
    expect(limiter.retryAfterSecs("unknown")).toBe(0);
  });

  it("cleanup evicts stale entries", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 });
    limiter.check("ip1");
    limiter.check("ip2");
    expect(limiter.size).toBe(2);

    // Advance past window + cleanup interval (5 min)
    vi.advanceTimersByTime(300_001);

    expect(limiter.size).toBe(0);
  });

  it("cleanup keeps active entries", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 });
    limiter.check("ip1");

    // Advance to just before cleanup fires, then add another request
    vi.advanceTimersByTime(299_000);
    limiter.check("ip2"); // Recent — should survive cleanup

    vi.advanceTimersByTime(2_000); // Trigger cleanup at 301s

    // ip1 is stale (301s old > 60s window), ip2 is recent (2s old)
    expect(limiter.size).toBe(1);
  });

  it("sliding window allows gradual refill", () => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });

    limiter.check("ip1"); // t=0
    vi.advanceTimersByTime(20_000);
    limiter.check("ip1"); // t=20s
    vi.advanceTimersByTime(20_000);
    limiter.check("ip1"); // t=40s
    expect(limiter.check("ip1")).toBe(false); // Full

    // Advance to t=61s — first request (t=0) falls out of window
    vi.advanceTimersByTime(21_000);
    expect(limiter.check("ip1")).toBe(true); // One slot freed
  });
});
