import { db } from "./db";
import { Suit, SeatIndex, Mode } from "../../shared/types";

export async function createRoomRecord(
  roomId: string,
  mode: Mode
): Promise<void> {
  if (!db) return;
  try {
    await db.query(
      "INSERT INTO rooms (id, mode) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [roomId, mode]
    );
  } catch (e) {
    console.error("[persistence] createRoomRecord failed:", e);
  }
}

export async function saveHandResult(data: {
  roomId: string;
  handNo: number;
  trump: Suit | null;
  ombre: SeatIndex | null;
  resting: SeatIndex | null;
  result: string;
  points: number;
  award: SeatIndex[];
  tricks: Record<number, number>;
  scores: Record<number, number>;
}): Promise<void> {
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO results (room_id, hand_no, result, points, award, tricks, scores)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        data.roomId,
        data.handNo,
        data.result,
        data.points,
        JSON.stringify(data.award),
        JSON.stringify(data.tricks),
        JSON.stringify(data.scores),
      ]
    );
  } catch (e) {
    console.error("[persistence] saveHandResult failed:", e);
  }
}

export async function saveMatchResult(data: {
  roomId: string;
  mode: Mode;
  winner: SeatIndex;
  finalScores: Record<number, number>;
  totalHands: number;
  playerIds: (string | null)[];
}): Promise<void> {
  if (!db) return;
  try {
    // Check if match_players table exists (from migration 002)
    const tableCheck = await db.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'match_players'
      )`
    );
    if (!tableCheck.rows[0].exists) return;

    for (let i = 0; i < data.playerIds.length; i++) {
      const pid = data.playerIds[i];
      if (!pid) continue; // skip bots

      const isWinner = i === data.winner;
      await db.query(
        `INSERT INTO match_players (room_id, player_id, seat, final_score, is_winner)
         VALUES ($1, $2, $3, $4, $5)`,
        [data.roomId, pid, i, data.finalScores[i] || 0, isWinner]
      );

      // Update player stats
      await db.query(
        `UPDATE players SET
           games_played = COALESCE(games_played, 0) + 1,
           wins = COALESCE(wins, 0) + $2,
           last_played = NOW()
         WHERE id = $1`,
        [pid, isWinner ? 1 : 0]
      );
    }
  } catch (e) {
    console.error("[persistence] saveMatchResult failed:", e);
  }
}

export async function getPlayerStats(
  playerId: string
): Promise<{
  gamesPlayed: number;
  wins: number;
  elo: number;
} | null> {
  if (!db) return null;
  try {
    const result = await db.query(
      "SELECT games_played, wins, elo FROM players WHERE id = $1",
      [playerId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      gamesPlayed: row.games_played || 0,
      wins: row.wins || 0,
      elo: row.elo || 1200,
    };
  } catch (e) {
    console.error("[persistence] getPlayerStats failed:", e);
    return null;
  }
}
