import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppContext } from "../../router";
import { showToast } from "../../ui/toast";
import "../../screens/leaderboard.css";

interface LeaderboardEntry {
  playerId: string;
  handle: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  elo: number;
  lastPlayed: string | null;
}

type FilterMode = "all" | "active";
type ActivityTone = "fresh" | "recent" | "quiet" | "idle";
type RateTone = "elite" | "strong" | "steady" | "cold";

interface ActivityMeta {
  label: string;
  detail: string;
  tone: ActivityTone;
  isActive: boolean;
}

const SEASON_LABEL = "Season 4: The Golden Age";
const ACTIVE_WINDOW_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PODIUM_ORDER = [2, 1, 3] as const;
const numberFormatter = new Intl.NumberFormat();
const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const PODIUM_STYLES: Record<
  1 | 2 | 3,
  {
    accent: string;
    border: string;
    halo: string;
    surface: string;
  }
> = {
  1: {
    accent: "#d6a64a",
    border: "rgba(214, 166, 74, 0.78)",
    halo: "rgba(214, 166, 74, 0.26)",
    surface:
      "linear-gradient(180deg, rgba(88, 60, 10, 0.98) 0%, rgba(61, 41, 6, 0.96) 100%)",
  },
  2: {
    accent: "#cbd5e1",
    border: "rgba(203, 213, 225, 0.72)",
    halo: "rgba(203, 213, 225, 0.14)",
    surface:
      "linear-gradient(180deg, rgba(30, 33, 40, 0.95) 0%, rgba(23, 26, 32, 0.96) 100%)",
  },
  3: {
    accent: "#b87333",
    border: "rgba(184, 115, 51, 0.62)",
    halo: "rgba(184, 115, 51, 0.16)",
    surface:
      "linear-gradient(180deg, rgba(30, 33, 40, 0.95) 0%, rgba(23, 26, 32, 0.96) 100%)",
  },
};

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(Number.isFinite(value) ? value : 0));
}

function formatPercent(value: number): string {
  return `${Math.round((Number.isFinite(value) ? value : 0) * 100)}%`;
}

function getHandle(entry: LeaderboardEntry): string {
  return entry.handle.trim() || "Unknown player";
}

function getInitials(handle: string): string {
  const parts = handle
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function hashSeed(value: string): number {
  let seed = 0;
  for (let index = 0; index < value.length; index += 1) {
    seed = (seed * 31 + value.charCodeAt(index)) >>> 0;
  }
  return seed;
}

function getAvatarStyle(entry: LeaderboardEntry): CSSProperties {
  const hue = hashSeed(`${entry.playerId}:${getHandle(entry)}`) % 360;
  return {
    backgroundImage: `radial-gradient(circle at 32% 24%, hsl(${hue} 78% 78%) 0%, hsl(${hue} 62% 48%) 26%, hsl(${(hue + 38) % 360} 52% 18%) 100%)`,
  };
}

function getActivityMeta(lastPlayed: string | null): ActivityMeta {
  if (!lastPlayed) {
    return {
      label: "No record",
      detail: "No completed table logged",
      tone: "idle",
      isActive: false,
    };
  }

  const playedAt = new Date(lastPlayed);
  if (Number.isNaN(playedAt.valueOf())) {
    return {
      label: "Unknown",
      detail: "Last match unavailable",
      tone: "idle",
      isActive: false,
    };
  }

  const diffDays = (Date.now() - playedAt.getTime()) / DAY_IN_MS;
  if (diffDays < 1) {
    return {
      label: "Today",
      detail: "Last table logged today",
      tone: "fresh",
      isActive: true,
    };
  }

  if (diffDays < 7) {
    return {
      label: "This week",
      detail: `Last table ${Math.max(1, Math.floor(diffDays))}d ago`,
      tone: "recent",
      isActive: true,
    };
  }

  if (diffDays < ACTIVE_WINDOW_DAYS) {
    return {
      label: "This month",
      detail: `Last table ${Math.floor(diffDays)}d ago`,
      tone: "quiet",
      isActive: true,
    };
  }

  return {
    label: "Quiet",
    detail: `Last table ${shortDateFormatter.format(playedAt)}`,
    tone: "idle",
    isActive: false,
  };
}

function getRateTone(winRate: number): RateTone {
  if (winRate >= 0.68) return "elite";
  if (winRate >= 0.55) return "strong";
  if (winRate >= 0.5) return "steady";
  return "cold";
}

function isRecentlyActive(lastPlayed: string | null): boolean {
  return getActivityMeta(lastPlayed).isActive;
}

function formatUpdatedLabel(lastLoadedAt: Date | null): string {
  if (!lastLoadedAt) return "Awaiting ledger sync";

  const now = new Date();
  if (lastLoadedAt.toDateString() === now.toDateString()) {
    return `Updated ${timeFormatter.format(lastLoadedAt)}`;
  }

  return `Updated ${dateTimeFormatter.format(lastLoadedAt)}`;
}

function TrophyIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M6 4h12v2a4 4 0 0 1-3 3.874V12a3 3 0 0 1-2 2.816V17h3v2H8v-2h3v-2.184A3 3 0 0 1 9 12V9.874A4 4 0 0 1 6 6V4Zm2 2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2H8Zm-2 0H4a3 3 0 0 0 3 3V8.83A3.98 3.98 0 0 1 6 6Zm14 0a3.98 3.98 0 0 1-1 2.83V9a3 3 0 0 0 3-3h-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SearchIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm8.914 11.5 1.414 1.414-3.35 3.35-1.414-1.414 3.35-3.35Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PodiumCard({
  entry,
  rank,
  isSelf,
}: {
  entry: LeaderboardEntry;
  rank: 1 | 2 | 3;
  isSelf: boolean;
}): ReactElement {
  const activity = getActivityMeta(entry.lastPlayed);
  const podiumStyle = PODIUM_STYLES[rank];
  const cardStyle = {
    "--podium-accent": podiumStyle.accent,
    "--podium-border": podiumStyle.border,
    "--podium-halo": podiumStyle.halo,
    "--podium-surface": podiumStyle.surface,
  } as CSSProperties;

  return (
    <article
      className={`podium-card${isSelf ? " is-self" : ""}`}
      data-rank={rank}
      style={cardStyle}
    >
      <div className="podium-medallion" aria-hidden="true">
        <span>{rank}</span>
      </div>

      <div className="podium-avatar-wrap">
        <div className="podium-avatar" style={getAvatarStyle(entry)}>
          <span>{getInitials(getHandle(entry))}</span>
        </div>
      </div>

      <div className="podium-card-tags">
        <span className="podium-rank-tag">Rank {rank}</span>
        {isSelf ? <span className="podium-rank-tag podium-rank-tag-self">You</span> : null}
      </div>

      <h2>{getHandle(entry)}</h2>
      <p className="podium-card-summary">
        {formatNumber(entry.wins)} wins in {formatNumber(entry.gamesPlayed)} games
      </p>

      <div className="podium-card-status">
        <span className="activity-pill" data-tone={activity.tone}>
          {activity.label}
        </span>
        <span className="podium-card-status-copy">{activity.detail}</span>
      </div>

      <div className="podium-card-stats">
        <div className="podium-stat">
          <span className="podium-stat-label">Points</span>
          <strong>{formatNumber(entry.elo)}</strong>
        </div>
        <div className="podium-stat">
          <span className="podium-stat-label">Win rate</span>
          <strong>{formatPercent(entry.winRate)}</strong>
        </div>
      </div>
    </article>
  );
}

function SkeletonPodiumCard({ rank }: { rank: 1 | 2 | 3 }): ReactElement {
  return (
    <div className="podium-card podium-card-skeleton" data-rank={rank}>
      <div className="podium-medallion" aria-hidden="true" />
      <span className="skel-block skel-circle podium-avatar podium-avatar-skeleton" />
      <span className="skel-block podium-skeleton-line podium-skeleton-tag" />
      <span className="skel-block podium-skeleton-line podium-skeleton-name" />
      <span className="skel-block podium-skeleton-line podium-skeleton-meta" />
      <div className="podium-card-stats">
        <div className="podium-stat podium-stat-skeleton">
          <span className="skel-block podium-skeleton-line podium-skeleton-stat-label" />
          <span className="skel-block podium-skeleton-line podium-skeleton-stat-value" />
        </div>
        <div className="podium-stat podium-stat-skeleton">
          <span className="skel-block podium-skeleton-line podium-skeleton-stat-label" />
          <span className="skel-block podium-skeleton-line podium-skeleton-stat-value" />
        </div>
      </div>
    </div>
  );
}

function SkeletonLedgerRow({ index }: { index: number }): ReactElement {
  return (
    <div
      className="leaderboard-ledger-row leaderboard-ledger-row-skeleton"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="leaderboard-ledger-cell leaderboard-ledger-rank">
        <span className="skel-block skel-text" style={{ width: 42 }} />
      </div>
      <div className="leaderboard-ledger-cell leaderboard-ledger-player">
        <span className="skel-block skel-circle leaderboard-player-avatar leaderboard-player-avatar-skeleton" />
        <div className="leaderboard-ledger-player-copy">
          <span
            className="skel-block skel-text"
            style={{ width: `${120 + ((index * 21) % 64)}px` }}
          />
          <span
            className="skel-block skel-text leaderboard-ledger-meta-skeleton"
            style={{ width: `${100 + ((index * 17) % 54)}px` }}
          />
        </div>
      </div>
      <div className="leaderboard-ledger-cell leaderboard-ledger-activity">
        <span className="skel-block skel-text" style={{ width: 74 }} />
        <span className="skel-block skel-text leaderboard-ledger-meta-skeleton" style={{ width: 118 }} />
      </div>
      <div className="leaderboard-ledger-cell leaderboard-ledger-points">
        <span className="skel-block skel-text" style={{ width: 68 }} />
      </div>
      <div className="leaderboard-ledger-cell leaderboard-ledger-rate">
        <span className="skel-block skel-text" style={{ width: 60 }} />
      </div>
    </div>
  );
}

export function LeaderboardScreen({ ctx }: { ctx: AppContext }): ReactElement {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";
      const res = await fetch(`${base}/api/leaderboard?limit=25`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      setRows(Array.isArray(payload?.leaderboard) ? payload.leaderboard : []);
      setLastLoadedAt(new Date());
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Could not load leaderboard";
      setError(nextError);
      throw err instanceof Error ? err : new Error(nextError);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {
      // `load` already updates local state.
    });
  }, [load]);

  const myId = useMemo(() => {
    const mySeat = ctx.state.mySeat;
    if (mySeat === null) return null;
    return ctx.state.game?.players?.[mySeat]?.playerId ?? null;
  }, [ctx.state.game, ctx.state.mySeat]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return rows.filter((entry) => {
      const matchesFilter = filterMode === "all" || isRecentlyActive(entry.lastPlayed);
      const matchesQuery =
        !normalizedQuery || getHandle(entry).toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [filterMode, rows, searchQuery]);

  const podiumRows = filteredRows.slice(0, 3);
  const tableRows = filteredRows.slice(3);
  const hasRows = rows.length > 0;
  const hasFilters = filterMode !== "all" || searchQuery.trim().length > 0;
  const inlineError = Boolean(error && hasRows);
  const updatedLabel = refreshing ? "Refreshing ledger..." : formatUpdatedLabel(lastLoadedAt);
  const ledgerOverline = tableRows.length
    ? `Rankings ${podiumRows.length + 1} - ${filteredRows.length}`
    : hasFilters
      ? "Filtered podium"
      : "Season ledger";
  const ledgerHeadline = tableRows.length
    ? "Rankings beyond the podium"
    : hasFilters
      ? "Only podium finishes match this view"
      : "Only the podium is populated";
  const ledgerSupport = hasFilters
    ? `${formatNumber(filteredRows.length)} players match this view.`
    : updatedLabel;

  const refreshLeaderboard = useCallback(() => {
    load({ background: rows.length > 0 }).catch(() => {
      showToast("Could not refresh leaderboard", "error");
    });
  }, [load, rows.length]);

  const clearView = useCallback(() => {
    setFilterMode("all");
    setSearchQuery("");
  }, []);

  return (
    <div className="screen leaderboard-screen">
      <div className="leaderboard-wrap">
        <div className="leaderboard-header">
          <button
            className="btn-ghost-felt leaderboard-nav-btn"
            type="button"
            onClick={() => ctx.router.navigate("home")}
          >
            ← Back
          </button>
          <button
            className="btn-ivory-engraved leaderboard-refresh-btn"
            type="button"
            disabled={loading || refreshing}
            onClick={refreshLeaderboard}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <section className="leaderboard-hero">
          <div className="leaderboard-hero-copy">
            <div className="leaderboard-season-tag">
              <TrophyIcon />
              <span>{SEASON_LABEL}</span>
            </div>
            <h1>The Grand Ledger</h1>
            <p>
              A definitive record of the most esteemed Grandees across the Spanish realms.
            </p>
          </div>

          <div className="leaderboard-hero-controls">
            <div className="leaderboard-filter-pills" role="group" aria-label="Leaderboard filters">
              <button
                className={`leaderboard-filter-pill${filterMode === "all" ? " active" : ""}`}
                type="button"
                aria-pressed={filterMode === "all"}
                onClick={() => setFilterMode("all")}
              >
                All players
              </button>
              <button
                className={`leaderboard-filter-pill${filterMode === "active" ? " active" : ""}`}
                type="button"
                aria-pressed={filterMode === "active"}
                onClick={() => setFilterMode("active")}
              >
                Active 30d
              </button>
            </div>
          </div>
        </section>

        {inlineError ? (
          <div className="leaderboard-inline-error" role="status">
            <strong>Refresh failed.</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <>
            <section className="leaderboard-podium" aria-hidden="true">
              {PODIUM_ORDER.map((rank) => (
                <SkeletonPodiumCard key={rank} rank={rank} />
              ))}
            </section>

            <section className="leaderboard-ledger" aria-hidden="true">
              <div className="leaderboard-ledger-header">
                <div className="leaderboard-ledger-titleblock">
                  <span className="leaderboard-overline">Rankings 4 - 25</span>
                  <h2>Rankings beyond the podium</h2>
                  <p>Syncing the latest standings...</p>
                </div>

                <label className="leaderboard-search">
                  <SearchIcon />
                  <input disabled readOnly type="search" value="" placeholder="Find a player..." />
                </label>
              </div>

              <div className="leaderboard-ledger-table">
                <div className="leaderboard-ledger-head">
                  <div>Rank</div>
                  <div>Grandee</div>
                  <div>Activity</div>
                  <div>Points</div>
                  <div>Win rate</div>
                </div>

                {Array.from({ length: 5 }, (_, index) => (
                  <SkeletonLedgerRow key={index} index={index} />
                ))}
              </div>

              <div className="leaderboard-ledger-footer">
                <span>Preparing the season ledger</span>
                <span>Loading standings...</span>
              </div>
            </section>
          </>
        ) : error && !hasRows ? (
          <div className="leaderboard-state-card leaderboard-state-card-error">
            <span className="leaderboard-overline">Ledger unavailable</span>
            <h2>The rankings could not be opened.</h2>
            <p>{error}</p>
            <div className="leaderboard-state-actions">
              <button className="btn-ivory-engraved" type="button" onClick={refreshLeaderboard}>
                Try again
              </button>
              <button
                className="btn-ghost-felt leaderboard-nav-btn"
                type="button"
                onClick={() => ctx.router.navigate("home")}
              >
                Return home
              </button>
            </div>
          </div>
        ) : !hasRows ? (
          <div className="leaderboard-state-card">
            <span className="leaderboard-overline">No standings yet</span>
            <h2>The ledger is waiting for its first name.</h2>
            <p>Finish a match to seed the season table and reveal the first podium.</p>
            <div className="leaderboard-state-actions">
              <button
                className="btn-gold-plaque"
                type="button"
                onClick={() => ctx.router.navigate("home")}
              >
                Play your first game
              </button>
            </div>
          </div>
        ) : !filteredRows.length ? (
          <div className="leaderboard-state-card">
            <span className="leaderboard-overline">No matches</span>
            <h2>No players fit this ledger view.</h2>
            <p>Try another name or clear the activity filter to reopen the full standings.</p>
            <div className="leaderboard-state-actions">
              <button className="btn-ivory-engraved" type="button" onClick={clearView}>
                Clear filters
              </button>
            </div>
          </div>
        ) : (
          <>
            <section className="leaderboard-podium" aria-label="Top three players">
              {PODIUM_ORDER.map((rank) => {
                const entry = filteredRows[rank - 1];
                if (!entry) return null;

                return (
                  <PodiumCard
                    key={entry.playerId}
                    entry={entry}
                    rank={rank}
                    isSelf={Boolean(myId && entry.playerId === myId)}
                  />
                );
              })}
            </section>

            <section className="leaderboard-ledger" aria-label="Leaderboard table">
              <div className="leaderboard-ledger-header">
                <div className="leaderboard-ledger-titleblock">
                  <span className="leaderboard-overline">{ledgerOverline}</span>
                  <h2>{ledgerHeadline}</h2>
                  <p>{ledgerSupport}</p>
                </div>

                <label className="leaderboard-search">
                  <SearchIcon />
                  <input
                    aria-label="Find a player"
                    autoComplete="off"
                    type="search"
                    value={searchQuery}
                    placeholder="Find a player..."
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </label>
              </div>

              {tableRows.length ? (
                <div className="leaderboard-ledger-table">
                  <div className="leaderboard-ledger-head">
                    <div>Rank</div>
                    <div>Grandee</div>
                    <div>Activity</div>
                    <div>Points</div>
                    <div>Win rate</div>
                  </div>

                  {tableRows.map((entry, index) => {
                    const rank = index + podiumRows.length + 1;
                    const activity = getActivityMeta(entry.lastPlayed);
                    const isSelf = Boolean(myId && entry.playerId === myId);

                    return (
                      <div
                        key={`${entry.playerId}-${rank}`}
                        className={`leaderboard-ledger-row${isSelf ? " self-row" : ""}`}
                      >
                        <div className="leaderboard-ledger-cell leaderboard-ledger-rank">#{rank}</div>

                        <div className="leaderboard-ledger-cell leaderboard-ledger-player">
                          <div className="leaderboard-player-avatar" style={getAvatarStyle(entry)}>
                            <span>{getInitials(getHandle(entry))}</span>
                          </div>

                          <div className="leaderboard-ledger-player-copy">
                            <div className="leaderboard-ledger-player-line">
                              <span className="leaderboard-player-name">{getHandle(entry)}</span>
                              {isSelf ? (
                                <span className="podium-rank-tag podium-rank-tag-self">You</span>
                              ) : null}
                            </div>
                            <span className="leaderboard-player-meta">
                              {formatNumber(entry.wins)} wins · {formatNumber(entry.gamesPlayed)} games
                            </span>
                          </div>
                        </div>

                        <div className="leaderboard-ledger-cell leaderboard-ledger-activity">
                          <span className="activity-pill" data-tone={activity.tone}>
                            {activity.label}
                          </span>
                          <span className="leaderboard-activity-detail">{activity.detail}</span>
                        </div>

                        <div className="leaderboard-ledger-cell leaderboard-ledger-points">
                          {formatNumber(entry.elo)}
                        </div>

                        <div className="leaderboard-ledger-cell leaderboard-ledger-rate">
                          <span className="winrate-pill" data-tone={getRateTone(entry.winRate)}>
                            {formatPercent(entry.winRate)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="leaderboard-ledger-empty">
                  <p>
                    {hasFilters
                      ? "Your current view only returns podium finishes."
                      : "More rankings will appear here as the season fills out."}
                  </p>
                </div>
              )}

              <div className="leaderboard-ledger-footer">
                <span>
                  {hasFilters
                    ? `Showing ${formatNumber(filteredRows.length)} matching players`
                    : `Showing ${formatNumber(rows.length)} ranked players`}
                </span>
                <span>{updatedLabel}</span>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
