import { randomUUID } from "crypto";
import { db } from "./db";
import {
  AnimationSpeed,
  AuthUserSummary,
  MatchHistoryResponse,
  MeResponse,
  PersistedPlayerSettings,
  ProfileMatchHistoryEntry,
  Suit,
  SeatIndex,
  Mode,
  TableThemeKey,
  UpdateMeProfileRequest,
  WalletResponse,
} from "../../shared/types";

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

const DEFAULT_ACCOUNT_SETTINGS: PersistedPlayerSettings = {
  locale: "en",
  soundEnabled: true,
  espadaObligatoria: true,
  soundVolume: 0.7,
  colorblindMode: false,
  tableTheme: "classic",
  cardSkin: "clasica",
  animationSpeed: "normal",
  reduceMotion: false,
};

export const FRIENDLY_TOKEN_ANTE = 100;
export const FRIENDLY_TOKEN_STARTER_BALANCE = 1000;
export const FRIENDLY_TOKEN_RESCUE_THRESHOLD = 100;
export const FRIENDLY_TOKEN_RESCUE_TARGET = 500;
export const FRIENDLY_TOKEN_RESCUE_COOLDOWN_HOURS = 24;

const HISTORY_ROLE_VALUES = new Set(["ombre", "contra", "resting"]);
const HISTORY_OUTCOME_VALUES = new Set(["win", "loss"]);

function defaultHandleFromAuthUser(user: AuthUserSummary): string {
  const emailPrefix = user.email?.split("@")[0]?.trim() || "";
  const normalized = emailPrefix.replace(/\s+/g, " ").trim().slice(0, 18);
  return normalized || "Player";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeSoundVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function normalizeLocale(value: unknown, fallback: PersistedPlayerSettings["locale"]): PersistedPlayerSettings["locale"] {
  return value === "es" || value === "en" ? value : fallback;
}

function normalizeAnimationSpeed(
  value: unknown,
  fallback: AnimationSpeed
): AnimationSpeed {
  return value === "slow" || value === "normal" || value === "fast"
    ? value
    : fallback;
}

function normalizeTableTheme(
  value: unknown,
  fallback: TableThemeKey
): TableThemeKey {
  return value === "classic" || value === "royal" || value === "rustic"
    ? value
    : fallback;
}

function normalizeCardSkin(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function mapSettingsRow(row: Record<string, unknown>): PersistedPlayerSettings {
  return {
    locale: normalizeLocale(row.locale, DEFAULT_ACCOUNT_SETTINGS.locale),
    soundEnabled: normalizeBoolean(
      row.sound_enabled,
      DEFAULT_ACCOUNT_SETTINGS.soundEnabled
    ),
    espadaObligatoria: normalizeBoolean(
      row.espada_obligatoria,
      DEFAULT_ACCOUNT_SETTINGS.espadaObligatoria
    ),
    soundVolume: normalizeSoundVolume(
      row.sound_volume,
      DEFAULT_ACCOUNT_SETTINGS.soundVolume
    ),
    colorblindMode: normalizeBoolean(
      row.colorblind_mode,
      DEFAULT_ACCOUNT_SETTINGS.colorblindMode
    ),
    tableTheme: normalizeTableTheme(
      row.table_theme,
      DEFAULT_ACCOUNT_SETTINGS.tableTheme
    ),
    cardSkin: normalizeCardSkin(
      row.preferred_card_skin,
      DEFAULT_ACCOUNT_SETTINGS.cardSkin
    ),
    animationSpeed: normalizeAnimationSpeed(
      row.animation_speed,
      DEFAULT_ACCOUNT_SETTINGS.animationSpeed
    ),
    reduceMotion: normalizeBoolean(
      row.reduce_motion,
      DEFAULT_ACCOUNT_SETTINGS.reduceMotion
    ),
  };
}

function buildMeResponse(
  row: Record<string, unknown>,
  user: AuthUserSummary,
  bootstrapSuggested: boolean
): MeResponse {
  return {
    playerId: String(row.id),
    email: user.email,
    name: typeof row.handle === "string" && row.handle.trim()
      ? row.handle
      : defaultHandleFromAuthUser(user),
    avatar: typeof row.avatar_path === "string" ? row.avatar_path : "",
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    gamesPlayed: Number(row.games_played) || 0,
    wins: Number(row.wins) || 0,
    elo: Number(row.elo) || 1200,
    lastPlayed: row.last_played ? String(row.last_played) : null,
    settings: mapSettingsRow(row),
    bootstrapSuggested,
  };
}

function computeWalletStatus(
  playerId: string,
  balance: number,
  lastRescueAt: string | null
): WalletResponse {
  const now = Date.now();
  const rescueAvailableAt = lastRescueAt
    ? new Date(
        new Date(lastRescueAt).getTime() +
          FRIENDLY_TOKEN_RESCUE_COOLDOWN_HOURS * 60 * 60 * 1000
      ).toISOString()
    : null;
  const canClaimRescue =
    balance < FRIENDLY_TOKEN_RESCUE_THRESHOLD &&
    (!rescueAvailableAt || new Date(rescueAvailableAt).getTime() <= now);

  return {
    playerId,
    balance,
    currency: "friendly_tokens",
    rescueThreshold: FRIENDLY_TOKEN_RESCUE_THRESHOLD,
    rescueTarget: FRIENDLY_TOKEN_RESCUE_TARGET,
    rescueCooldownHours: FRIENDLY_TOKEN_RESCUE_COOLDOWN_HOURS,
    canClaimRescue,
    rescueAvailableAt,
    lastRescueAt,
  };
}

function normalizeHistoryRole(value: unknown): ProfileMatchHistoryEntry["role"] {
  return typeof value === "string" && HISTORY_ROLE_VALUES.has(value)
    ? (value as ProfileMatchHistoryEntry["role"])
    : "contra";
}

function normalizeHistoryOutcome(
  value: unknown
): ProfileMatchHistoryEntry["outcome"] {
  return typeof value === "string" && HISTORY_OUTCOME_VALUES.has(value)
    ? (value as ProfileMatchHistoryEntry["outcome"])
    : "loss";
}

async function tableExists(tableName: string): Promise<boolean> {
  if (!db) return false;
  const result = await db.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
        WHERE table_name = $1
     )`,
    [tableName]
  );
  return Boolean(result.rows[0]?.exists);
}

function sanitizeProfileUpdate(
  update: UpdateMeProfileRequest
): UpdateMeProfileRequest {
  const next: UpdateMeProfileRequest = {};
  if (typeof update.name === "string" && update.name.trim()) {
    next.name = update.name.trim().slice(0, 18);
  }
  if (typeof update.avatar === "string") {
    next.avatar = update.avatar.trim().slice(0, 1000);
  }
  if (update.settings && typeof update.settings === "object") {
    const current = update.settings;
    const partial: Partial<PersistedPlayerSettings> = {};
    if ("locale" in current) {
      partial.locale = normalizeLocale(
        current.locale,
        DEFAULT_ACCOUNT_SETTINGS.locale
      );
    }
    if ("soundEnabled" in current) {
      partial.soundEnabled = normalizeBoolean(
        current.soundEnabled,
        DEFAULT_ACCOUNT_SETTINGS.soundEnabled
      );
    }
    if ("espadaObligatoria" in current) {
      partial.espadaObligatoria = normalizeBoolean(
        current.espadaObligatoria,
        DEFAULT_ACCOUNT_SETTINGS.espadaObligatoria
      );
    }
    if ("soundVolume" in current) {
      partial.soundVolume = normalizeSoundVolume(
        current.soundVolume,
        DEFAULT_ACCOUNT_SETTINGS.soundVolume
      );
    }
    if ("colorblindMode" in current) {
      partial.colorblindMode = normalizeBoolean(
        current.colorblindMode,
        DEFAULT_ACCOUNT_SETTINGS.colorblindMode
      );
    }
    if ("tableTheme" in current) {
      partial.tableTheme = normalizeTableTheme(
        current.tableTheme,
        DEFAULT_ACCOUNT_SETTINGS.tableTheme
      );
    }
    if ("cardSkin" in current) {
      partial.cardSkin = normalizeCardSkin(
        current.cardSkin,
        DEFAULT_ACCOUNT_SETTINGS.cardSkin
      );
    }
    if ("animationSpeed" in current) {
      partial.animationSpeed = normalizeAnimationSpeed(
        current.animationSpeed,
        DEFAULT_ACCOUNT_SETTINGS.animationSpeed
      );
    }
    if ("reduceMotion" in current) {
      partial.reduceMotion = normalizeBoolean(
        current.reduceMotion,
        DEFAULT_ACCOUNT_SETTINGS.reduceMotion
      );
    }
    next.settings = partial;
  }
  return next;
}

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
  gameTarget: number;
  ombre: SeatIndex | null;
  resting: SeatIndex | null;
  stakeMode: "free" | "tokens";
  ante: number;
  pot: number;
  startedAt?: string | null;
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
    const [hasLegacyMatchPlayers, hasMatchesTable, hasMatchParticipantsTable] =
      await Promise.all([
        tableExists("match_players"),
        tableExists("matches"),
        tableExists("match_participants"),
      ]);

    if (!hasLegacyMatchPlayers && (!hasMatchesTable || !hasMatchParticipantsTable)) {
      return;
    }

    await db.query("BEGIN");
    try {
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

      const sortedSeats = Object.entries(data.finalScores)
        .map(([seat, score]) => ({
          seat: Number(seat),
          score: Number(score) || 0,
        }))
        .filter((entry) => !Number.isNaN(entry.seat) && entry.seat >= 0 && entry.seat <= 3)
        .sort((a, b) => b.score - a.score || a.seat - b.seat);
      const placementBySeat = new Map<number, number>();
      sortedSeats.forEach((entry, index) => {
        placementBySeat.set(entry.seat, index + 1);
      });

      let matchId: string | null = null;
      let matchNo: number | null = null;
      const endedAt = new Date().toISOString();
      if (hasMatchesTable && hasMatchParticipantsTable) {
        const nextMatchNoResult = await db.query(
          `SELECT COALESCE(MAX(match_no), 0) + 1 AS next_match_no
             FROM matches
            WHERE room_id = $1`,
          [data.roomId]
        );
        matchId = randomUUID();
        matchNo = Number(nextMatchNoResult.rows[0]?.next_match_no) || 1;
      }

      for (let i = 0; i < data.playerIds.length; i++) {
        const pid = data.playerIds[i];
        if (!pid) continue; // skip bots

        const handle = data.playerHandles[i] || `Player ${String(pid).slice(0, 8)}`;
        const isWinner = i === data.winner;
        await ensurePlayerRecord(pid, handle);

        if (hasLegacyMatchPlayers) {
          await db.query(
            `INSERT INTO match_players (room_id, player_id, seat, final_score, is_winner)
             VALUES ($1, $2::uuid, $3, $4, $5)`,
            [data.roomId, pid, i, data.finalScores[i] || 0, isWinner]
          );
        }

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

      if (matchId && matchNo !== null) {
        const winnerPlayerId = data.playerIds[data.winner] || null;
        await db.query(
          `INSERT INTO matches (
             id,
             room_id,
             match_no,
             mode,
             game_target,
             stake_mode,
             ante,
             pot,
             winner_player_id,
             winner_seat,
             ombre_seat,
             resting_seat,
             total_hands,
             started_at,
             ended_at,
             status
           ) VALUES (
             $1::uuid,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             $8,
             $9::uuid,
             $10,
             $11,
             $12,
             $13,
             $14::timestamptz,
             $15::timestamptz,
             'completed'
           )`,
          [
            matchId,
            data.roomId,
            matchNo,
            data.mode,
            data.gameTarget,
            data.stakeMode,
            data.ante,
            data.pot,
            winnerPlayerId,
            data.winner,
            data.ombre,
            data.resting,
            data.totalHands,
            data.startedAt || endedAt,
            endedAt,
          ]
        );

        for (let seat = 0; seat < data.playerHandles.length; seat++) {
          const playerId = data.playerIds[seat] || null;
          const playerHandle = data.playerHandles[seat] || null;
          if (!playerId && !playerHandle) continue;

          const placement = placementBySeat.get(seat) ?? null;
          const isWinner = seat === data.winner;
          const role =
            seat === data.ombre
              ? "ombre"
              : seat === data.resting
                ? "resting"
                : "contra";
          const stakeDelta =
            data.stakeMode === "tokens" && playerId
              ? isWinner
                ? data.pot - data.ante
                : -data.ante
              : 0;

          await db.query(
            `INSERT INTO match_participants (
               match_id,
               player_id,
               player_handle,
               seat,
               is_bot,
               final_score,
               placement,
               role,
               outcome,
               stake_delta
             ) VALUES (
               $1::uuid,
               $2::uuid,
               $3,
               $4,
               $5,
               $6,
               $7,
               $8,
               $9,
               $10
             )`,
            [
              matchId,
              playerId,
              playerHandle,
              seat,
              !playerId,
              data.finalScores[seat] || 0,
              placement,
              role,
              isWinner ? "win" : "loss",
              stakeDelta,
            ]
          );
        }
      }

      await db.query("COMMIT");
    } catch (txErr) {
      await db.query("ROLLBACK").catch(() => {});
      throw txErr;
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
  lastPlayed: string | null;
} | null> {
  if (!db) return null;
  try {
    const result = await db.query(
      "SELECT games_played, wins, elo, last_played FROM players WHERE id = $1",
      [playerId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      gamesPlayed: row.games_played || 0,
      wins: row.wins || 0,
      elo: row.elo || 1200,
      lastPlayed: row.last_played ? String(row.last_played) : null,
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

export async function getOrCreateAuthenticatedProfile(
  user: AuthUserSummary
): Promise<MeResponse | null> {
  if (!db) return null;
  try {
    const existing = await db.query(
      `SELECT *
         FROM players
        WHERE auth_user_id = $1::uuid
           OR id = $1::uuid
        LIMIT 1`,
      [user.id]
    );

    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO players (
           id,
           auth_user_id,
           handle,
           avatar_path,
           locale,
           preferred_card_skin,
           sound_enabled,
           espada_obligatoria,
           sound_volume,
           colorblind_mode,
           table_theme,
           animation_speed,
           reduce_motion,
           last_seen_at
         ) VALUES (
           $1::uuid,
           $1::uuid,
           $2,
           '',
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           NOW()
         )`,
        [
          user.id,
          defaultHandleFromAuthUser(user),
          DEFAULT_ACCOUNT_SETTINGS.locale,
          DEFAULT_ACCOUNT_SETTINGS.cardSkin,
          DEFAULT_ACCOUNT_SETTINGS.soundEnabled,
          DEFAULT_ACCOUNT_SETTINGS.espadaObligatoria,
          DEFAULT_ACCOUNT_SETTINGS.soundVolume,
          DEFAULT_ACCOUNT_SETTINGS.colorblindMode,
          DEFAULT_ACCOUNT_SETTINGS.tableTheme,
          DEFAULT_ACCOUNT_SETTINGS.animationSpeed,
          DEFAULT_ACCOUNT_SETTINGS.reduceMotion,
        ]
      );

      const created = await db.query("SELECT * FROM players WHERE id = $1::uuid", [
        user.id,
      ]);
      if (created.rows.length === 0) return null;
      return buildMeResponse(created.rows[0], user, true);
    }

    await db.query(
      `UPDATE players
          SET auth_user_id = COALESCE(auth_user_id, $1::uuid),
              last_seen_at = NOW()
        WHERE id = $1::uuid
           OR auth_user_id = $1::uuid`,
      [user.id]
    );

    return buildMeResponse(existing.rows[0], user, false);
  } catch (e) {
    console.error("[persistence] getOrCreateAuthenticatedProfile failed:", e);
    return null;
  }
}

export async function updateAuthenticatedProfile(
  user: AuthUserSummary,
  update: UpdateMeProfileRequest
): Promise<MeResponse | null> {
  if (!db) return null;
  const existing = await getOrCreateAuthenticatedProfile(user);
  if (!existing) return null;

  const sanitized = sanitizeProfileUpdate(update);
  const nextSettings = {
    ...existing.settings,
    ...(sanitized.settings || {}),
  };
  const nextName = sanitized.name ?? existing.name;
  const nextAvatar = sanitized.avatar ?? existing.avatar;

  try {
    const result = await db.query(
      `UPDATE players
          SET handle = $2,
              avatar_path = $3,
              locale = $4,
              preferred_card_skin = $5,
              sound_enabled = $6,
              espada_obligatoria = $7,
              sound_volume = $8,
              colorblind_mode = $9,
              table_theme = $10,
              animation_speed = $11,
              reduce_motion = $12,
              auth_user_id = COALESCE(auth_user_id, $1::uuid),
              last_seen_at = NOW()
        WHERE id = $1::uuid
           OR auth_user_id = $1::uuid
      RETURNING *`,
      [
        user.id,
        nextName,
        nextAvatar,
        nextSettings.locale,
        nextSettings.cardSkin,
        nextSettings.soundEnabled,
        nextSettings.espadaObligatoria,
        nextSettings.soundVolume,
        nextSettings.colorblindMode,
        nextSettings.tableTheme,
        nextSettings.animationSpeed,
        nextSettings.reduceMotion,
      ]
    );
    if (result.rows.length === 0) return null;
    return buildMeResponse(result.rows[0], user, false);
  } catch (e) {
    console.error("[persistence] updateAuthenticatedProfile failed:", e);
    return null;
  }
}

export async function getWalletForAuthUser(
  user: AuthUserSummary
): Promise<WalletResponse | null> {
  if (!db) return null;
  const me = await getOrCreateAuthenticatedProfile(user);
  if (!me) return null;

  try {
    const result = await db.query(
      `SELECT id::text AS id, token_balance, last_rescue_at
         FROM players
        WHERE id = $1::uuid
           OR auth_user_id = $1::uuid
        LIMIT 1`,
      [user.id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return computeWalletStatus(
      row.id,
      Number(row.token_balance) || 0,
      row.last_rescue_at ? String(row.last_rescue_at) : null
    );
  } catch (e) {
    console.error("[persistence] getWalletForAuthUser failed:", e);
    return null;
  }
}

export async function claimFriendlyRescue(
  user: AuthUserSummary
): Promise<
  | { ok: true; wallet: WalletResponse }
  | { ok: false; code: "PERSISTENCE_UNAVAILABLE" | "NOT_ELIGIBLE" | "UNKNOWN_PLAYER" }
> {
  if (!db) {
    return { ok: false, code: "PERSISTENCE_UNAVAILABLE" };
  }
  await getOrCreateAuthenticatedProfile(user);

  try {
    await db.query("BEGIN");
    const result = await db.query(
      `SELECT id::text AS id, token_balance, last_rescue_at
         FROM players
        WHERE id = $1::uuid
           OR auth_user_id = $1::uuid
        LIMIT 1
        FOR UPDATE`,
      [user.id]
    );
    if (result.rows.length === 0) {
      await db.query("ROLLBACK").catch(() => {});
      return { ok: false, code: "UNKNOWN_PLAYER" };
    }

    const row = result.rows[0];
    const balance = Number(row.token_balance) || 0;
    const lastRescueAt = row.last_rescue_at ? String(row.last_rescue_at) : null;
    const wallet = computeWalletStatus(row.id, balance, lastRescueAt);
    if (!wallet.canClaimRescue) {
      await db.query("ROLLBACK").catch(() => {});
      return { ok: false, code: "NOT_ELIGIBLE" };
    }

    const delta = Math.max(0, FRIENDLY_TOKEN_RESCUE_TARGET - balance);
    const nextBalance = balance + delta;
    await db.query(
      `UPDATE players
          SET token_balance = $2,
              last_rescue_at = NOW()
        WHERE id = $1::uuid`,
      [row.id, nextBalance]
    );
    await db.query(
      `INSERT INTO token_ledger (
         player_id,
         delta,
         balance_after,
         reason,
         metadata
       ) VALUES ($1::uuid, $2, $3, $4, $5::jsonb)`,
      [
        row.id,
        delta,
        nextBalance,
        "rescue",
        JSON.stringify({ targetBalance: FRIENDLY_TOKEN_RESCUE_TARGET }),
      ]
    );
    await db.query("COMMIT");

    return {
      ok: true,
      wallet: computeWalletStatus(
        row.id,
        nextBalance,
        new Date().toISOString()
      ),
    };
  } catch (e) {
    await db?.query("ROLLBACK").catch(() => {});
    console.error("[persistence] claimFriendlyRescue failed:", e);
    return { ok: false, code: "PERSISTENCE_UNAVAILABLE" };
  }
}

export async function hasEnoughFriendlyTokens(
  playerId: string,
  required = FRIENDLY_TOKEN_ANTE
): Promise<boolean> {
  if (!db) return false;
  try {
    const result = await db.query(
      "SELECT token_balance FROM players WHERE id = $1::uuid LIMIT 1",
      [playerId]
    );
    if (result.rows.length === 0) return false;
    return (Number(result.rows[0].token_balance) || 0) >= required;
  } catch (e) {
    console.error("[persistence] hasEnoughFriendlyTokens failed:", e);
    return false;
  }
}

export async function getMatchHistoryForAuthUser(
  user: AuthUserSummary,
  limit = 8
): Promise<MatchHistoryResponse | null> {
  if (!db) return null;
  const me = await getOrCreateAuthenticatedProfile(user);
  if (!me) return null;

  try {
    const [hasMatchesTable, hasMatchParticipantsTable] = await Promise.all([
      tableExists("matches"),
      tableExists("match_participants"),
    ]);
    if (!hasMatchesTable || !hasMatchParticipantsTable) {
      return {
        matches: [],
        count: 0,
        generatedAt: new Date().toISOString(),
      };
    }

    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(20, Math.floor(limit)))
      : 8;

    const result = await db.query(
      `SELECT
         mp.match_id::text AS id,
         m.mode,
         mp.outcome,
         mp.role,
         mp.final_score,
         mp.placement,
         m.ended_at,
         m.stake_mode,
         m.ante,
         m.pot
       FROM match_participants mp
       JOIN matches m
         ON m.id = mp.match_id
      WHERE mp.player_id = $1::uuid
      ORDER BY m.ended_at DESC NULLS LAST, mp.created_at DESC, mp.id DESC
      LIMIT $2`,
      [me.playerId, safeLimit]
    );

    const matches: ProfileMatchHistoryEntry[] = result.rows.map((row) => ({
      id: String(row.id),
      mode: row.mode === "quadrille" ? "quadrille" : "tresillo",
      outcome: normalizeHistoryOutcome(row.outcome),
      role: normalizeHistoryRole(row.role),
      score: Number(row.final_score) || 0,
      recordedAt: row.ended_at ? String(row.ended_at) : new Date().toISOString(),
      placement:
        row.placement === null || row.placement === undefined
          ? null
          : Number(row.placement) || null,
      stakeMode: row.stake_mode === "tokens" ? "tokens" : "free",
      ante: Number(row.ante) || 0,
      pot: Number(row.pot) || 0,
    }));

    return {
      matches,
      count: matches.length,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error("[persistence] getMatchHistoryForAuthUser failed:", e);
    return null;
  }
}

export async function fundFriendlyStakeMatch(
  playerIds: string[],
  matchRef: string,
  ante = FRIENDLY_TOKEN_ANTE
): Promise<{ ok: true; pot: number } | { ok: false; insufficientPlayerIds: string[] }> {
  if (!db) {
    return { ok: false, insufficientPlayerIds: playerIds };
  }
  const participants = [...new Set(playerIds.filter(Boolean))];
  if (participants.length === 0) {
    return { ok: true, pot: 0 };
  }

  try {
    await db.query("BEGIN");
    const result = await db.query(
      `SELECT id::text AS id, token_balance
         FROM players
        WHERE id = ANY($1::uuid[])
        FOR UPDATE`,
      [participants]
    );
    const balances = new Map<string, number>();
    for (const row of result.rows) {
      balances.set(row.id, Number(row.token_balance) || 0);
    }

    const insufficientPlayerIds = participants.filter(
      (playerId) => (balances.get(playerId) ?? -1) < ante
    );
    if (insufficientPlayerIds.length > 0) {
      await db.query("ROLLBACK").catch(() => {});
      return { ok: false, insufficientPlayerIds };
    }

    for (const playerId of participants) {
      const nextBalance = (balances.get(playerId) || 0) - ante;
      await db.query(
        "UPDATE players SET token_balance = $2 WHERE id = $1::uuid",
        [playerId, nextBalance]
      );
      await db.query(
        `INSERT INTO token_ledger (
           player_id,
           delta,
           balance_after,
           reason,
           match_ref,
           metadata
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`,
        [
          playerId,
          -ante,
          nextBalance,
          "stake_ante",
          matchRef,
          JSON.stringify({ ante }),
        ]
      );
    }

    await db.query("COMMIT");
    return { ok: true, pot: participants.length * ante };
  } catch (e) {
    await db?.query("ROLLBACK").catch(() => {});
    console.error("[persistence] fundFriendlyStakeMatch failed:", e);
    return { ok: false, insufficientPlayerIds: participants };
  }
}

export async function settleFriendlyStakeMatch(
  winnerPlayerId: string,
  matchRef: string,
  pot: number
): Promise<boolean> {
  if (!db || pot <= 0) return false;
  try {
    await db.query("BEGIN");
    const winnerResult = await db.query(
      `SELECT token_balance
         FROM players
        WHERE id = $1::uuid
        LIMIT 1
        FOR UPDATE`,
      [winnerPlayerId]
    );
    if (winnerResult.rows.length === 0) {
      await db.query("ROLLBACK").catch(() => {});
      return false;
    }
    const currentBalance = Number(winnerResult.rows[0].token_balance) || 0;
    const nextBalance = currentBalance + pot;
    await db.query(
      `INSERT INTO token_ledger (
         player_id,
         delta,
         balance_after,
         reason,
         match_ref,
         metadata
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`,
      [
        winnerPlayerId,
        pot,
        nextBalance,
        "stake_win",
        matchRef,
        JSON.stringify({ pot }),
      ]
    );
    await db.query(
      "UPDATE players SET token_balance = $2 WHERE id = $1::uuid",
      [winnerPlayerId, nextBalance]
    );
    await db.query("COMMIT");
    return true;
  } catch (e: any) {
    await db?.query("ROLLBACK").catch(() => {});
    if (e?.code === "23505") {
      return true;
    }
    console.error("[persistence] settleFriendlyStakeMatch failed:", e);
    return false;
  }
}

export function __resetInMemoryLeaderboardForTests(): void {
  inMemoryLeaderboard.clear();
}
