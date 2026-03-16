import { describe, it, expect } from "vitest";
import { calculateHandScore, scorePenetro } from "../src/scoring";
import type { SeatIndex } from "../../shared/types";

describe("scoring", () => {
  it("scores standard sacada hands directly from production logic", () => {
    const result = calculateHandScore({
      contract: "entrada",
      ombre: 0 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 5, 1: 2, 2: 2, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [0, 0, 1, 0, 2, 0, 1, 0, 2] as SeatIndex[],
    });

    expect(result.result).toBe("sacada");
    expect(result.points).toBe(1);
    expect(result.award).toEqual([0]);
    expect(result.deltas).toEqual({ 0: 1 });
  });

  it("applies oros bonus for declarer wins", () => {
    const result = calculateHandScore({
      contract: "solo_oros",
      ombre: 1 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 1, 1: 5, 2: 3, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [1, 2, 1, 0, 1, 2, 1, 1, 2] as SeatIndex[],
    });

    expect(result.result).toBe("sacada");
    expect(result.points).toBe(2);
    expect(result.deltas).toEqual({ 1: 2 });
  });

  it("scores codille to the winning defender", () => {
    const result = calculateHandScore({
      contract: "volteo",
      ombre: 0 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 3, 1: 5, 2: 1, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [1, 0, 1, 2, 1, 0, 1, 0, 1] as SeatIndex[],
    });

    expect(result.result).toBe("codille");
    expect(result.points).toBe(2);
    expect(result.award).toEqual([1]);
    expect(result.deltas).toEqual({ 1: 2 });
  });

  it("scores sacada when ombre has the unique highest trick count below five", () => {
    const result = calculateHandScore({
      contract: "entrada",
      ombre: 0 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 4, 1: 3, 2: 2, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [0, 1, 2, 1, 0, 2, 1, 0, 0] as SeatIndex[],
    });

    expect(result.result).toBe("sacada");
    expect(result.points).toBe(1);
    expect(result.award).toEqual([0]);
    expect(result.deltas).toEqual({ 0: 1 });
  });

  it("scores codille when a defender has more tricks than ombre (below 5)", () => {
    const result = calculateHandScore({
      contract: "entrada",
      ombre: 0 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 3, 1: 4, 2: 2, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [1, 0, 1, 2, 1, 0, 1, 0, 0] as SeatIndex[],
    });
    expect(result.result).toBe("codille");
    expect(result.points).toBe(2);
    expect(result.award).toEqual([1]);
  });

  it("scores sacada when ombre leads individually even without five tricks", () => {
    const result = calculateHandScore({
      contract: "entrada",
      ombre: 0 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 4, 1: 3, 2: 2, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [0, 1, 2, 1, 0, 2, 1, 0, 0] as SeatIndex[],
    });
    expect(result.result).toBe("sacada");
    expect(result.points).toBe(1);
    expect(result.award).toEqual([0]);
  });

  it("scores puesta when ombre ties for the highest trick total", () => {
    const result = calculateHandScore({
      contract: "entrada",
      ombre: 0 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 4, 1: 4, 2: 1, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [0, 1, 0, 1, 2, 0, 1, 0, 1] as SeatIndex[],
    });
    expect(result.result).toBe("puesta");
    expect(result.points).toBe(1);
    expect(result.award).toEqual([1, 2]);
  });

  it("scores puesta when all active players tie on tricks", () => {
    const result = calculateHandScore({
      contract: "entrada",
      ombre: 0 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 3, 1: 3, 2: 3, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [0, 1, 2, 0, 1, 2, 0, 1, 2] as SeatIndex[],
    });
    expect(result.result).toBe("puesta");
    expect(result.points).toBe(1);
    expect(result.award).toEqual([1, 2]);
  });

  it("scores bola directly against the declared ombre", () => {
    const made = calculateHandScore({
      contract: "bola",
      ombre: 1 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 0, 1: 9, 2: 0, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [1, 1, 1, 1, 1, 1, 1, 1, 1] as SeatIndex[],
    });
    const failed = calculateHandScore({
      contract: "bola",
      ombre: 1 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 2, 1: 7, 2: 0, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [1, 0, 1, 1, 0, 1, 1, 1, 1] as SeatIndex[],
    });

    expect(made.result).toBe("bola_made");
    expect(made.deltas).toEqual({ 1: 6 });
    expect(failed.result).toBe("bola_failed");
    expect(failed.deltas).toEqual({ 0: 2, 2: 2 });
  });

  it("scores contrabola directly from production logic", () => {
    const made = calculateHandScore({
      contract: "contrabola",
      ombre: 2 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 5, 1: 4, 2: 0, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [0, 1, 0, 1, 0, 1, 0, 1, 0] as SeatIndex[],
    });
    const failed = calculateHandScore({
      contract: "contrabola",
      ombre: 2 as SeatIndex,
      activeSeats: [0, 1, 2] as SeatIndex[],
      tricks: { 0: 4, 1: 3, 2: 2, 3: 0 } as Record<SeatIndex, number>,
      trickWinners: [2, 0, 1, 0, 2, 1, 0, 1, 0] as SeatIndex[],
    });

    expect(made.result).toBe("contrabola_made");
    expect(made.deltas).toEqual({ 2: 4 });
    expect(failed.result).toBe("contrabola_failed");
    expect(failed.deltas).toEqual({ 0: 1, 1: 1 });
  });

  it("breaks penetro ties by latest winning trick", () => {
    const result = scorePenetro(
      { 0: 3, 1: 3, 2: 2, 3: 1 } as Record<SeatIndex, number>,
      [0, 1, 2, 3] as SeatIndex[],
      [0, 1, 2, 0, 3, 1, 0, 2, 1] as SeatIndex[]
    );

    expect(result.result).toBe("penetro");
    expect(result.award).toEqual([1]);
    expect(result.deltas).toEqual({ 1: 2 });
  });
});
