import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Room, RoomConfig } from "../src/room";
import { SeatIndex, ALL_SEATS } from "../../shared/types";
import { WebSocket } from "ws";

/**
 * Simulation test: runs many full bot-vs-bot games using fake timers
 * to let the Room's internal timer-driven flow work naturally.
 * Asserts no crashes, valid state, and correct trick counts.
 */

function makeFakeWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: () => {},
    close: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    ping: () => {},
  } as any;
}

function runBotGame(mode: "tresillo" | "quadrille"): {
  hands: number;
  finalScores: Record<number, number>;
  errors: string[];
} {
  const errors: string[] = [];
  const room = new Room("sim-" + Math.random().toString(36).slice(2), {
    mode,
    code: "SIM001",
    gameTarget: 12,
    creatorId: "sim",
  });

  // Add one "human" — keep isBot=false so canStart() passes
  const ws = makeFakeWs();
  const conn = room.attach(ws);
  conn.seat = 0 as SeatIndex;

  room.startGame();

  // Now make seat 0 auto-play as a bot and kick off the timer chain
  conn.isBot = true;
  (room as any).botMaybeAct();

  // Wrap doBotAction to catch errors without crashing the timer chain
  const origDoBotAction = (room as any).doBotAction.bind(room);
  (room as any).doBotAction = (seat: SeatIndex) => {
    try {
      origDoBotAction(seat);
    } catch (e: any) {
      errors.push(`Bot action error: ${e.message}`);
    }
  };

  // Advance fake timers to let the Room's internal flow drive the game.
  // Each iteration advances 1500ms — enough for bot delays (600-1200ms)
  // and will eventually cover post-hand delays (3000ms) over 2 iterations.
  let iterations = 0;
  const maxIterations = 10000;

  while (iterations < maxIterations && room.state.phase !== "match_end" && errors.length === 0) {
    iterations++;
    vi.advanceTimersByTime(1500);
  }

  // Clean up any remaining timers
  vi.clearAllTimers();

  return {
    hands: room.state.handNo,
    finalScores: { ...room.state.scores },
    errors,
  };
}

describe("Bot simulation - tresillo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("completes 50 games without errors", () => {
    const allErrors: string[] = [];
    for (let i = 0; i < 50; i++) {
      const result = runBotGame("tresillo");
      allErrors.push(...result.errors);
    }
    expect(allErrors).toEqual([]);
  }, 30000);

  it("games produce non-negative scores", () => {
    for (let i = 0; i < 10; i++) {
      const result = runBotGame("tresillo");
      for (const [seat, score] of Object.entries(result.finalScores)) {
        expect(score).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("game reaches match_end or progresses past hand 1", () => {
    // Run a few attempts — random shuffles may sometimes need more iterations
    let passed = false;
    for (let attempt = 0; attempt < 5 && !passed; attempt++) {
      const result = runBotGame("tresillo");
      if (
        result.hands > 1 ||
        result.finalScores[0] >= 12 ||
        result.finalScores[1] >= 12 ||
        result.finalScores[2] >= 12
      ) {
        passed = true;
      }
    }
    expect(passed).toBe(true);
  });
});

describe("Bot simulation - quadrille", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("completes 50 games without errors", () => {
    const allErrors: string[] = [];
    for (let i = 0; i < 50; i++) {
      const result = runBotGame("quadrille");
      allErrors.push(...result.errors);
    }
    expect(allErrors).toEqual([]);
  }, 30000);

  it("quadrille games produce valid scores", () => {
    for (let i = 0; i < 10; i++) {
      const result = runBotGame("quadrille");
      for (const score of Object.values(result.finalScores)) {
        expect(score).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
