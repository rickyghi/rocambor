import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createTranslator, localeTag, type Locale } from "../../i18n";
import type { AppContext } from "../../router";
import { showToast } from "../../ui/toast";
import { useSettings } from "../hooks";
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

const ACTIVE_WINDOW_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PODIUM_ORDER = [2, 1, 3] as const;

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

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeTag(locale)).format(Math.round(Number.isFinite(value) ? value : 0));
}

function formatPercent(value: number, locale: Locale): string {
  return `${Math.round((Number.isFinite(value) ? value : 0) * 100)}%`;
}

function getHandle(entry: LeaderboardEntry, locale: Locale): string {
  return entry.handle.trim() || (locale === "es" ? "Jugador desconocido" : "Unknown player");
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

function getAvatarStyle(entry: LeaderboardEntry, locale: Locale): CSSProperties {
  const hue = hashSeed(`${entry.playerId}:${getHandle(entry, locale)}`) % 360;
  return {
    backgroundImage: `radial-gradient(circle at 32% 24%, hsl(${hue} 78% 78%) 0%, hsl(${hue} 62% 48%) 26%, hsl(${(hue + 38) % 360} 52% 18%) 100%)`,
  };
}

function getActivityMeta(lastPlayed: string | null, locale: Locale): ActivityMeta {
  const { t } = createTranslator(locale);
  const shortDateFormatter = new Intl.DateTimeFormat(localeTag(locale), {
    month: "short",
    day: "numeric",
  });
  if (!lastPlayed) {
    return {
      label: t("leaderboard.noRecord"),
      detail: t("leaderboard.noCompleted"),
      tone: "idle",
      isActive: false,
    };
  }

  const playedAt = new Date(lastPlayed);
  if (Number.isNaN(playedAt.valueOf())) {
    return {
      label: t("leaderboard.unknown"),
      detail: t("leaderboard.lastUnavailable"),
      tone: "idle",
      isActive: false,
    };
  }

  const diffDays = (Date.now() - playedAt.getTime()) / DAY_IN_MS;
  if (diffDays < 1) {
    return {
      label: t("leaderboard.today"),
      detail: t("leaderboard.loggedToday"),
      tone: "fresh",
      isActive: true,
    };
  }

  if (diffDays < 7) {
    return {
      label: t("leaderboard.thisWeek"),
      detail: t("leaderboard.lastTableDaysAgo", { days: Math.max(1, Math.floor(diffDays)) }),
      tone: "recent",
      isActive: true,
    };
  }

  if (diffDays < ACTIVE_WINDOW_DAYS) {
    return {
      label: t("leaderboard.thisMonth"),
      detail: t("leaderboard.lastTableDaysAgo", { days: Math.floor(diffDays) }),
      tone: "quiet",
      isActive: true,
    };
  }

  return {
    label: t("leaderboard.quiet"),
    detail:
      locale === "es"
        ? `Última mesa ${shortDateFormatter.format(playedAt)}`
        : `Last table ${shortDateFormatter.format(playedAt)}`,
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
  return getActivityMeta(lastPlayed, "en").isActive;
}

function formatUpdatedLabel(lastLoadedAt: Date | null, locale: Locale): string {
  const { t } = createTranslator(locale);
  if (!lastLoadedAt) return t("leaderboard.awaitingSync");
  const dateTimeFormatter = new Intl.DateTimeFormat(localeTag(locale), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const timeFormatter = new Intl.DateTimeFormat(localeTag(locale), {
    hour: "numeric",
    minute: "2-digit",
  });

  const now = new Date();
  if (lastLoadedAt.toDateString() === now.toDateString()) {
    return t("leaderboard.updatedToday", { time: timeFormatter.format(lastLoadedAt) });
  }

  return t("leaderboard.updatedAt", { time: dateTimeFormatter.format(lastLoadedAt) });
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
  locale,
}: {
  entry: LeaderboardEntry;
  rank: 1 | 2 | 3;
  isSelf: boolean;
  locale: Locale;
}): ReactElement {
  const { t } = createTranslator(locale);
  const activity = getActivityMeta(entry.lastPlayed, locale);
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
        <div className="podium-avatar" style={getAvatarStyle(entry, locale)}>
          <span>{getInitials(getHandle(entry, locale))}</span>
        </div>
      </div>

      <div className="podium-card-tags">
        <span className="podium-rank-tag">{t("leaderboard.rankTag", { rank })}</span>
        {isSelf ? <span className="podium-rank-tag podium-rank-tag-self">{t("common.you")}</span> : null}
      </div>

      <h2>{getHandle(entry, locale)}</h2>
      <p className="podium-card-summary">
        {t("leaderboard.winsGames", {
          wins: formatNumber(entry.wins, locale),
          games: formatNumber(entry.gamesPlayed, locale),
        })}
      </p>

      <div className="podium-card-status">
        <span className="activity-pill" data-tone={activity.tone}>
          {activity.label}
        </span>
        <span className="podium-card-status-copy">{activity.detail}</span>
      </div>

      <div className="podium-card-stats">
        <div className="podium-stat">
          <span className="podium-stat-label">{t("leaderboard.points")}</span>
          <strong>{formatNumber(entry.elo, locale)}</strong>
        </div>
        <div className="podium-stat">
          <span className="podium-stat-label">{t("leaderboard.winRate")}</span>
          <strong>{formatPercent(entry.winRate, locale)}</strong>
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
  const settings = useSettings(ctx.settings);
  const locale = settings.locale;
  const { t } = createTranslator(locale);
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
      const nextError = err instanceof Error ? err.message : t("leaderboard.refreshFailed");
      setError(nextError);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

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
        !normalizedQuery || getHandle(entry, locale).toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [filterMode, rows, searchQuery]);

  const podiumRows = filteredRows.slice(0, 3);
  const tableRows = filteredRows.slice(3);
  const hasRows = rows.length > 0;
  const hasFilters = filterMode !== "all" || searchQuery.trim().length > 0;
  const inlineError = Boolean(error && hasRows);
  const updatedLabel = refreshing ? t("leaderboard.refreshing") : formatUpdatedLabel(lastLoadedAt, locale);
  const ledgerOverline = tableRows.length
    ? `${locale === "es" ? "Puestos" : "Rankings"} ${podiumRows.length + 1} - ${filteredRows.length}`
    : hasFilters
      ? t("leaderboard.filteredPodium")
      : t("leaderboard.seasonLedger");
  const ledgerHeadline = tableRows.length
    ? t("leaderboard.rankingsBeyond")
    : hasFilters
      ? t("leaderboard.onlyPodiumView")
      : t("leaderboard.onlyPodiumPopulated");
  const ledgerSupport = hasFilters
    ? t("leaderboard.playersMatch", { count: formatNumber(filteredRows.length, locale) })
    : updatedLabel;

  const refreshLeaderboard = useCallback(() => {
    load({ background: rows.length > 0 }).catch(() => {
      showToast(t("leaderboard.refreshFailed"), "error");
    });
  }, [load, rows.length, t]);

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
            ← {t("leaderboard.back")}
          </button>
          <button
            className="btn-ivory-engraved leaderboard-refresh-btn"
            type="button"
            disabled={loading || refreshing}
            onClick={refreshLeaderboard}
          >
            {refreshing ? t("leaderboard.refreshing") : t("common.refresh")}
          </button>
        </div>

        <section className="leaderboard-hero">
          <div className="leaderboard-hero-copy">
            <div className="leaderboard-season-tag">
              <TrophyIcon />
              <span>{t("leaderboard.season")}</span>
            </div>
            <h1>{t("leaderboard.title")}</h1>
            <p>{t("leaderboard.subtitle")}</p>
          </div>

          <div className="leaderboard-hero-controls">
            <div className="leaderboard-filter-pills" role="group" aria-label={t("leaderboard.filtersAria")}>
              <button
                className={`leaderboard-filter-pill${filterMode === "all" ? " active" : ""}`}
                type="button"
                aria-pressed={filterMode === "all"}
                onClick={() => setFilterMode("all")}
              >
                {t("leaderboard.filterAll")}
              </button>
              <button
                className={`leaderboard-filter-pill${filterMode === "active" ? " active" : ""}`}
                type="button"
                aria-pressed={filterMode === "active"}
                onClick={() => setFilterMode("active")}
              >
                {t("leaderboard.filterActive")}
              </button>
            </div>
          </div>
        </section>

        {inlineError ? (
          <div className="leaderboard-inline-error" role="status">
            <strong>{t("leaderboard.inlineErrorTitle")}</strong>
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
                  <span className="leaderboard-overline">{`${locale === "es" ? "Puestos" : "Rankings"} 4 - 25`}</span>
                  <h2>{t("leaderboard.rankingsBeyond")}</h2>
                  <p>{t("leaderboard.syncing")}</p>
                </div>

                <label className="leaderboard-search">
                  <SearchIcon />
                  <input disabled readOnly type="search" value="" placeholder={t("leaderboard.findPlayer")} />
                </label>
              </div>

              <div className="leaderboard-ledger-table">
                <div className="leaderboard-ledger-head">
                  <div>{t("leaderboard.rank")}</div>
                  <div>{t("leaderboard.grandee")}</div>
                  <div>{t("leaderboard.activity")}</div>
                  <div>{t("leaderboard.points")}</div>
                  <div>{t("leaderboard.winRate")}</div>
                </div>

                {Array.from({ length: 5 }, (_, index) => (
                  <SkeletonLedgerRow key={index} index={index} />
                ))}
              </div>

              <div className="leaderboard-ledger-footer">
                <span>{t("leaderboard.preparingLedger")}</span>
                <span>{t("leaderboard.loadingStandings")}</span>
              </div>
            </section>
          </>
        ) : error && !hasRows ? (
          <div className="leaderboard-state-card leaderboard-state-card-error">
            <span className="leaderboard-overline">{t("leaderboard.unavailable")}</span>
            <h2>{t("leaderboard.couldNotOpen")}</h2>
            <p>{error}</p>
            <div className="leaderboard-state-actions">
              <button className="btn-ivory-engraved" type="button" onClick={refreshLeaderboard}>
                {t("leaderboard.tryAgain")}
              </button>
              <button
                className="btn-ghost-felt leaderboard-nav-btn"
                type="button"
                onClick={() => ctx.router.navigate("home")}
              >
                {t("leaderboard.returnHome")}
              </button>
            </div>
          </div>
        ) : !hasRows ? (
          <div className="leaderboard-state-card">
            <span className="leaderboard-overline">{t("leaderboard.noStandings")}</span>
            <h2>{t("leaderboard.waitingFirst")}</h2>
            <p>{t("leaderboard.finishMatch")}</p>
            <div className="leaderboard-state-actions">
              <button
                className="btn-gold-plaque"
                type="button"
                onClick={() => ctx.router.navigate("home")}
              >
                {t("leaderboard.playFirstGame")}
              </button>
            </div>
          </div>
        ) : !filteredRows.length ? (
          <div className="leaderboard-state-card">
            <span className="leaderboard-overline">{t("leaderboard.noMatches")}</span>
            <h2>{t("leaderboard.noPlayersView")}</h2>
            <p>{t("leaderboard.tryAnotherName")}</p>
            <div className="leaderboard-state-actions">
              <button className="btn-ivory-engraved" type="button" onClick={clearView}>
                {t("leaderboard.clearFilters")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <section className="leaderboard-podium" aria-label={locale === "es" ? "Tres primeros jugadores" : "Top three players"}>
              {PODIUM_ORDER.map((rank) => {
                const entry = filteredRows[rank - 1];
                if (!entry) return null;

                return (
                  <PodiumCard
                    key={entry.playerId}
                    entry={entry}
                    rank={rank}
                    isSelf={Boolean(myId && entry.playerId === myId)}
                    locale={locale}
                  />
                );
              })}
            </section>

            <section className="leaderboard-ledger" aria-label={locale === "es" ? "Tabla de clasificación" : "Leaderboard table"}>
              <div className="leaderboard-ledger-header">
                <div className="leaderboard-ledger-titleblock">
                  <span className="leaderboard-overline">{ledgerOverline}</span>
                  <h2>{ledgerHeadline}</h2>
                  <p>{ledgerSupport}</p>
                </div>

                <label className="leaderboard-search">
                  <SearchIcon />
                  <input
                    aria-label={t("leaderboard.findPlayer")}
                    autoComplete="off"
                    type="search"
                    value={searchQuery}
                    placeholder={t("leaderboard.findPlayer")}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </label>
              </div>

              {tableRows.length ? (
                <div className="leaderboard-ledger-table">
                  <div className="leaderboard-ledger-head">
                    <div>{t("leaderboard.rank")}</div>
                    <div>{t("leaderboard.grandee")}</div>
                    <div>{t("leaderboard.activity")}</div>
                    <div>{t("leaderboard.points")}</div>
                    <div>{t("leaderboard.winRate")}</div>
                  </div>

                  {tableRows.map((entry, index) => {
                    const rank = index + podiumRows.length + 1;
                    const activity = getActivityMeta(entry.lastPlayed, locale);
                    const isSelf = Boolean(myId && entry.playerId === myId);

                    return (
                      <div
                        key={`${entry.playerId}-${rank}`}
                        className={`leaderboard-ledger-row${isSelf ? " self-row" : ""}`}
                      >
                        <div className="leaderboard-ledger-cell leaderboard-ledger-rank">#{rank}</div>

                        <div className="leaderboard-ledger-cell leaderboard-ledger-player">
                          <div className="leaderboard-player-avatar" style={getAvatarStyle(entry, locale)}>
                            <span>{getInitials(getHandle(entry, locale))}</span>
                          </div>

                          <div className="leaderboard-ledger-player-copy">
                            <div className="leaderboard-ledger-player-line">
                              <span className="leaderboard-player-name">{getHandle(entry, locale)}</span>
                              {isSelf ? (
                                <span className="podium-rank-tag podium-rank-tag-self">{t("common.you")}</span>
                              ) : null}
                            </div>
                            <span className="leaderboard-player-meta">
                              {t("leaderboard.winsGames", {
                                wins: formatNumber(entry.wins, locale),
                                games: formatNumber(entry.gamesPlayed, locale),
                              })}
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
                          {formatNumber(entry.elo, locale)}
                        </div>

                        <div className="leaderboard-ledger-cell leaderboard-ledger-rate">
                          <span className="winrate-pill" data-tone={getRateTone(entry.winRate)}>
                            {formatPercent(entry.winRate, locale)}
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
                      ? t("leaderboard.onlyPodiumCurrent")
                      : t("leaderboard.moreRankings")}
                  </p>
                </div>
              )}

              <div className="leaderboard-ledger-footer">
                <span>
                  {hasFilters
                    ? t("leaderboard.showingMatching", { count: formatNumber(filteredRows.length, locale) })
                    : t("leaderboard.showingRanked", { count: formatNumber(rows.length, locale) })}
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
