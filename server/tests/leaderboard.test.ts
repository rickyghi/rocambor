import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetInMemoryLeaderboardForTests,
  getLeaderboard,
  saveMatchResult,
} from "../src/persistence";

describe("Leaderboard persistence fallback", () => {
  beforeEach(() => {
    __resetInMemoryLeaderboardForTests();
  });

  it("aggregates wins and games in memory when DB is unavailable", async () => {
    const p1 = "11111111-1111-4111-8111-111111111111";
    const p2 = "22222222-2222-4222-8222-222222222222";

    await saveMatchResult({
      roomId: "room-a",
      mode: "tresillo",
      winner: 0,
      finalScores: { 0: 12, 1: 9, 2: 7, 3: 0 },
      totalHands: 6,
      playerIds: [p1, p2, null, null],
      playerHandles: ["Alice", "Bob", null, null],
    });

    await saveMatchResult({
      roomId: "room-b",
      mode: "tresillo",
      winner: 1,
      finalScores: { 0: 10, 1: 12, 2: 8, 3: 0 },
      totalHands: 7,
      playerIds: [p1, p2, null, null],
      playerHandles: ["Alice", "Bob", null, null],
    });

    const board = await getLeaderboard(10);
    expect(board.length).toBe(2);

    const alice = board.find((row) => row.playerId === p1)!;
    const bob = board.find((row) => row.playerId === p2)!;

    expect(alice.gamesPlayed).toBe(2);
    expect(bob.gamesPlayed).toBe(2);
    expect(alice.wins).toBe(1);
    expect(bob.wins).toBe(1);
    expect(alice.winRate).toBeCloseTo(0.5, 6);
    expect(bob.winRate).toBeCloseTo(0.5, 6);
  });
});
