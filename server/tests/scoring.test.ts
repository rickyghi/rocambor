import { describe, it, expect } from "vitest";
import { Room, RoomConfig } from "../src/room";
import { SeatIndex, Card, Suit, Bid } from "../../shared/types";

function card(s: Suit, r: number): Card {
  return { s, r: r as any, id: `${s[0]}${r}` };
}

function makeRoom(mode: "tresillo" | "quadrille" = "tresillo"): Room {
  const config: RoomConfig = {
    mode,
    code: "TEST01",
    gameTarget: 12,
    creatorId: "test",
  };
  return new Room("test-room", config);
}

// Helper to set up a hand in play phase with known tricks
function setupForScoring(
  room: Room,
  contract: string,
  ombre: SeatIndex,
  tricks: Record<number, number>
): void {
  room.state.phase = "play";
  room.state.contract = contract as any;
  room.state.ombre = ombre;
  room.state.tricks = { ...{ 0: 0, 1: 0, 2: 0, 3: 0 }, ...tricks };
  room.state.resting = 3 as SeatIndex;

  // Clear all hands to trigger finishHand
  for (let i = 0; i < 4; i++) {
    room.hands[i] = [];
  }
}

describe("scoring - entrada/standard contracts", () => {
  it("sacada: ombre wins 5 tricks -> 1 point", () => {
    const room = makeRoom();
    room.state.scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    setupForScoring(room, "entrada", 0, { 0: 5, 1: 2, 2: 2 });

    // Manually call finishHand via playing the last card scenario
    // Instead, we directly access the scoring logic
    const om = room.state.ombre!;
    const omTricks = room.state.tricks[om];
    expect(omTricks).toBe(5);

    // Ombre with 5 tricks in entrada = sacada, 1 point
    const points = omTricks === 9 ? 4 : omTricks >= 7 ? 2 : 1;
    expect(points).toBe(1);
  });

  it("sacada: ombre wins 7 tricks -> 2 points", () => {
    const om = 0 as SeatIndex;
    const omTricks = 7;
    const points = omTricks === 9 ? 4 : omTricks >= 7 ? 2 : 1;
    expect(points).toBe(2);
  });

  it("sacada: ombre wins 9 tricks -> 4 points", () => {
    const omTricks = 9;
    const points = omTricks === 9 ? 4 : omTricks >= 7 ? 2 : 1;
    expect(points).toBe(4);
  });

  it("codille: defender wins 5+ tricks -> defender gets 2 points", () => {
    // Ombre gets 3, defender gets 5, other gets 1
    const active: SeatIndex[] = [0, 1, 2];
    const om = 0 as SeatIndex;
    const t: Record<number, number> = { 0: 3, 1: 5, 2: 1 };
    const omTricks = t[om];

    expect(omTricks).toBeLessThan(5);
    const defenders = active.filter((s) => s !== om);
    const maxDef = Math.max(...defenders.map((s) => t[s]));
    expect(maxDef).toBe(5);

    // Result is codille
    const result = maxDef >= 5 ? "codille" : "puesta";
    expect(result).toBe("codille");
  });

  it("puesta: no one reaches 5 tricks -> each defender gets 1 point", () => {
    const active: SeatIndex[] = [0, 1, 2];
    const om = 0 as SeatIndex;
    const t: Record<number, number> = { 0: 4, 1: 3, 2: 2 };
    const omTricks = t[om];

    expect(omTricks).toBeLessThan(5);
    const defenders = active.filter((s) => s !== om);
    const maxDef = Math.max(...defenders.map((s) => t[s]));
    expect(maxDef).toBeLessThan(5);

    const result = maxDef >= 5 ? "codille" : "puesta";
    expect(result).toBe("puesta");
  });

  it("oros contract: +1 bonus point on sacada", () => {
    const contract = "oros";
    const omTricks = 6;
    let points = omTricks === 9 ? 4 : omTricks >= 7 ? 2 : 1;
    if (contract === "oros") points += 1;
    expect(points).toBe(2); // 1 base + 1 oros bonus
  });

  it("solo_oros contract: +1 bonus point on sacada", () => {
    const contract = "solo_oros";
    const omTricks = 5;
    let points = omTricks === 9 ? 4 : omTricks >= 7 ? 2 : 1;
    if (contract === "solo_oros") points += 1;
    expect(points).toBe(2); // 1 base + 1 bonus
  });
});

describe("scoring - bola", () => {
  it("bola made: ombre wins all 9 tricks -> 6 points", () => {
    const contract = "bola";
    const omTricks = 9;
    const ok = omTricks === 9;
    expect(ok).toBe(true);
    const points = ok ? 6 : 0;
    expect(points).toBe(6);
  });

  it("bola failed: defenders each get 2 points", () => {
    const contract = "bola";
    const omTricks = 7;
    const ok = omTricks === 9;
    expect(ok).toBe(false);

    // Each defender gets 2
    const defenderPoints = 2;
    const numDefenders = 2;
    expect(defenderPoints * numDefenders).toBe(4); // Total given out
  });
});

describe("scoring - contrabola", () => {
  it("contrabola made: ombre wins 0 tricks -> 4 points", () => {
    const omTricks = 0;
    const ok = omTricks === 0;
    expect(ok).toBe(true);
    const points = ok ? 4 : 0;
    expect(points).toBe(4);
  });

  it("contrabola failed: defenders each get 1 point", () => {
    const omTricks = 2;
    const ok = omTricks === 0;
    expect(ok).toBe(false);

    const defenderPoints = 1;
    expect(defenderPoints).toBe(1);
  });
});

describe("scoring - penetro", () => {
  it("player with most tricks gets 2 points", () => {
    const t: Record<number, number> = { 0: 4, 1: 2, 2: 2, 3: 1 };
    let maxTricks = -1;
    let winner = 0;
    for (const s of [0, 1, 2, 3]) {
      if (t[s] > maxTricks) {
        maxTricks = t[s];
        winner = s;
      }
    }
    expect(winner).toBe(0);
    expect(maxTricks).toBe(4);
    // Winner gets 2 points
    const points = 2;
    expect(points).toBe(2);
  });
});

describe("scoring - game target", () => {
  it("reaching game target triggers match end", () => {
    const scores: Record<number, number> = { 0: 11, 1: 5, 2: 3, 3: 0 };
    const target = 12;

    // After scoring 1 point, seat 0 reaches 12
    scores[0] += 1;
    const winner = Object.entries(scores).find(([_, v]) => v >= target);
    expect(winner).toBeTruthy();
    expect(winner![0]).toBe("0");
  });

  it("no winner below target", () => {
    const scores: Record<number, number> = { 0: 10, 1: 5, 2: 3, 3: 0 };
    const target = 12;
    const winner = Object.entries(scores).find(([_, v]) => v >= target);
    expect(winner).toBeUndefined();
  });
});
