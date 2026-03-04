import { db } from "./db";
import { Suit, SeatIndex, Mode } from "../../shared/types";

export interface LeaderboardEntry {
  playerId: string;
  handle: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  elo: number;
  lastPlayed: string | null;
}

interface MemoryStats {
  playerId: string;
  handle: string;
  gamesPlayed: number;
  wins: number;
  elo: number;
  lastPlayed: string | null;
}

const inMemoryLeaderboard = new Map<string, MemoryStats>();

// ---- Elo calculation ----
export function computeElo(
  ratingA: number,
  ratingB: number,
  scoreA: number, // 1.0 for win, 0.0 for loss
  K = 32
): number {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(ratingA + K * (scoreA - expectedA));
}

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

export async function ensurePlayerRecord(
  playerId: string,
  handle: string
): Promise<void> {
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO players (id, handle)
       VALUES ($1::uuid, $2)
       ON CONFLICT (id) DO UPDATE
       SET handle = EXCLUDED.handle`,
      [playerId, handle]
    );
  } catch (e) {
    console.error("[persistence] ensurePlayerRecord failed:", e);
  }
}

export async function saveMatchResult(data: {
  roomId: string;
  mode: Mode;
  winner: SeatIndex;
  finalScores: Record<number, number>;
  totalHands: number;
  playerIds: (string | null)[];
  playerHandles: (string | null)[];
}): Promise<void> {
  // Collect current Elos for all human players
  const eloMap = new Map<string, number>();
  for (let i = 0; i < data.playerIds.length; i++) {
    const pid = data.playerIds[i];
    if (!pid) continue;
    const prev = inMemoryLeaderboard.get(pid);
    eloMap.set(pid, prev?.elo ?? 1200);
  }

  // Compute new Elos
  const newElos = new Map<string, number>();
  for (let i = 0; i < data.playerIds.length; i++) {
    const pid = data.playerIds[i];
    if (!pid) continue;
    const myElo = eloMap.get(pid) ?? 1200;
    const isWinner = i === data.winner;

    // Average opponent Elo
    const opponentElos: number[] = [];
    for (let j = 0; j < data.playerIds.length; j++) {
      if (j !== i && data.playerIds[j]) {
        opponentElos.push(eloMap.get(data.playerIds[j]!) ?? 1200);
      }
    }
    const avgOpponentElo =
      opponentElos.length > 0
        ? opponentElos.reduce((a, b) => a + b, 0) / opponentElos.length
        : 1200;

    newElos.set(pid, computeElo(myElo, avgOpponentElo, isWinner ? 1.0 : 0.0));
  }

  // Update in-memory leaderboard with new Elos
  for (let i = 0; i < data.playerIds.length; i++) {
    const pid = data.playerIds[i];
    if (!pid) continue;
    const handle = data.playerHandles[i] || `Player ${String(pid).slice(0, 8)}`;
    const isWinner = i === data.winner;
    const prev = inMemoryLeaderboard.get(pid);
    const next: MemoryStats = {
      playerId: pid,
      handle,
      gamesPlayed: (prev?.gamesPlayed || 0) + 1,
      wins: (prev?.wins || 0) + (isWinner ? 1 : 0),
      elo: newElos.get(pid) ?? (prev?.elo || 1200),
      lastPlayed: new Date().toISOString(),
    };
    inMemoryLeaderboard.set(pid, next);
  }

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

    // Fetch current DB Elos for more accurate calculation
    const dbEloMap = new Map<string, number>();
    for (const pid of data.playerIds.filter(Boolean) as string[]) {
      const res = await db.query("SELECT elo FROM players WHERE id = $1", [pid]);
      dbEloMap.set(pid, res.rows[0]?.elo ?? 1200);
    }

    // Recompute Elos from DB values
    const dbNewElos = new Map<string, number>();
    for (let i = 0; i < data.playerIds.length; i++) {
      const pid = data.playerIds[i];
      if (!pid) continue;
      const myElo = dbEloMap.get(pid) ?? 1200;
      const isWinner = i === data.winner;
      const opps = data.playerIds
        .filter((_, j) => j !== i && data.playerIds[j] !== null)
        .map((opId) => dbEloMap.get(opId!) ?? 1200);
      const avgOpp =
        opps.length > 0
          ? opps.reduce((a, b) => a + b, 0) / opps.length
          : 1200;
      dbNewElos.set(pid, computeElo(myElo, avgOpp, isWinner ? 1.0 : 0.0));
    }

    for (let i = 0; i < data.playerIds.length; i++) {
      const pid = data.playerIds[i];
      if (!pid) continue; // skip bots

      const handle = data.playerHandles[i] || `Player ${String(pid).slice(0, 8)}`;
      const isWinner = i === data.winner;
      await ensurePlayerRecord(pid, handle);

      await db.query(
        `INSERT INTO match_players (room_id, player_id, seat, final_score, is_winner)
         VALUES ($1, $2::uuid, $3, $4, $5)`,
        [data.roomId, pid, i, data.finalScores[i] || 0, isWinner]
      );

      // Update player stats + Elo
      await db.query(
        `UPDATE players SET
           games_played = COALESCE(games_played, 0) + 1,
           wins = COALESCE(wins, 0) + $2,
           elo = $3,
           last_played = NOW()
         WHERE id = $1`,
        [pid, isWinner ? 1 : 0, dbNewElos.get(pid) ?? 1200]
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

export async function getLeaderboard(
  limit = 25
): Promise<LeaderboardEntry[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 25;

  if (db) {
    try {
      const result = await db.query(
        `SELECT
           id::text AS id,
           COALESCE(handle, 'Player') AS handle,
           COALESCE(games_played, 0) AS games_played,
           COALESCE(wins, 0) AS wins,
           COALESCE(elo, 1200) AS elo,
           last_played
         FROM players
         WHERE COALESCE(games_played, 0) > 0
         ORDER BY elo DESC, wins DESC, games_played DESC, last_played DESC NULLS LAST
         LIMIT $1`,
        [safeLimit]
      );

      if (result.rows.length > 0) {
        return result.rows.map((row: any) => ({
          playerId: row.id,
          handle: row.handle,
          gamesPlayed: Number(row.games_played) || 0,
          wins: Number(row.wins) || 0,
          winRate:
            (Number(row.games_played) || 0) > 0
              ? (Number(row.wins) || 0) / (Number(row.games_played) || 1)
              : 0,
          elo: Number(row.elo) || 1200,
          lastPlayed: row.last_played ? String(row.last_played) : null,
        }));
      }
    } catch (e) {
      console.error("[persistence] getLeaderboard failed (db), using memory:", e);
    }
  }

  return [...inMemoryLeaderboard.values()]
    .sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.gamesPlayed - a.gamesPlayed;
    })
    .slice(0, safeLimit)
    .map((entry) => ({
      playerId: entry.playerId,
      handle: entry.handle,
      gamesPlayed: entry.gamesPlayed,
      wins: entry.wins,
      winRate: entry.gamesPlayed > 0 ? entry.wins / entry.gamesPlayed : 0,
      elo: entry.elo,
      lastPlayed: entry.lastPlayed,
    }));
}

export function __resetInMemoryLeaderboardForTests(): void {
  inMemoryLeaderboard.clear();
}
