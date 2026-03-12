import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createTranslator, formatPlacement, modeLabel } from "../../i18n";
import type { SeatIndex } from "../../protocol";
import type { AppContext } from "../../router";
import { recordProfileMatch } from "../../lib/profile-history";
import { useClientState, useSettings } from "../hooks";
import "../../screens/match-summary.css";

function seatLabel(ctx: AppContext, seat: SeatIndex | null, locale: "en" | "es"): string {
  if (seat === null) return "...";
  if (seat === ctx.state.mySeat) return locale === "es" ? "Tú" : "You";
  const player = ctx.state.game?.players[seat];
  return player?.handle || `${locale === "es" ? "Asiento" : "Seat"} ${seat}`;
}

function buildConfettiPieces(): Array<{ color: string; left: number; delay: number; size: number }> {
  const particles: Array<{ color: string; left: number; delay: number; size: number }> = [];
  const colors = ["#C8A651", "#B02E2E", "#2A4D41", "#F8F6F0", "#C8A651", "#B02E2E"];

  for (let i = 0; i < 30; i++) {
    particles.push({
      color: colors[i % colors.length],
      left: Math.random() * 100,
      delay: Math.random() * 2,
      size: 4 + Math.random() * 6,
    });
  }

  return particles;
}
export function MatchSummaryScreen({ ctx }: { ctx: AppContext }): ReactElement | null {
  const state = useClientState(ctx.state);
  const settings = useSettings(ctx.settings);
  const game = state.game;
  const locale = settings.locale;
  const { t } = createTranslator(locale);
  const [hasVoted, setHasVoted] = useState(false);
  const [voteCount, setVoteCount] = useState<number | null>(null);
  const [voteRequired, setVoteRequired] = useState<number | null>(null);
  const recordedSummaryIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!game) {
      ctx.router.navigate("home");
      return;
    }
    if (game.phase === "lobby") {
      ctx.router.navigate("lobby");
    } else if (game.phase !== "match_end") {
      ctx.router.navigate("game");
    }
  }, [ctx.router, game]);

  useEffect(() => {
    ctx.sounds.matchEnd();
  }, [ctx.sounds]);

  useEffect(() => {
    const unsubscribe = ctx.connection.on("EVENT", (msg: any) => {
      if (msg.name === "REMATCH_VOTE") {
        const { count, required } = msg.payload as { count: number; required: number };
        setVoteCount(count);
        setVoteRequired(required);
      }
    });

    return unsubscribe;
  }, [ctx.connection]);

  const entries = useMemo(() => {
    if (!game) return [];
    return Object.entries(game.scores)
      .filter(([seat]) => Boolean(game.players[Number(seat)]))
      .map(([seat, score]) => ({
        seat: Number(seat) as SeatIndex,
        score: score as number,
      }))
      .sort((a, b) => b.score - a.score);
  }, [game]);

  const winner = entries[0] ?? null;
  const isMyWin = Boolean(winner && winner.seat === state.mySeat);
  const confetti = useMemo(() => (isMyWin ? buildConfettiPieces() : []), [isMyWin]);
  const myPlacement = entries.findIndex((entry) => entry.seat === state.mySeat);

  useEffect(() => {
    if (!game || state.mySeat === null || game.phase !== "match_end") return;

    const summaryId = `${game.roomId}:${game.handNo}:${state.mySeat}`;
    if (recordedSummaryIdRef.current === summaryId) return;
    recordedSummaryIdRef.current = summaryId;

    const rankedEntries = Object.entries(game.scores)
      .filter(([seat]) => Boolean(game.players[Number(seat)]))
      .map(([seat, score]) => ({
        seat: Number(seat) as SeatIndex,
        score: score as number,
      }))
      .sort((a, b) => b.score - a.score);

    const topEntry = rankedEntries[0] ?? null;
    const role =
      game.ombre === state.mySeat
        ? "ombre"
        : game.resting === state.mySeat
          ? "resting"
          : "contra";

    recordProfileMatch({
      id: summaryId,
      mode: game.mode,
      outcome: topEntry?.seat === state.mySeat ? "win" : "loss",
      role,
      score: game.scores[state.mySeat] || 0,
      recordedAt: new Date().toISOString(),
    });
  }, [game, state.mySeat]);

  if (!game) return null;

  const rematchLabel =
    hasVoted && voteCount !== null && voteRequired !== null
      ? `${t("common.playAgain")} (${voteCount}/${voteRequired})`
      : hasVoted
        ? t("match.playAgainWaiting")
        : voteCount !== null && voteRequired !== null
          ? `${t("common.playAgain")} (${voteCount}/${voteRequired})`
          : t("common.playAgain");
  const rematchCopy = hasVoted
    ? t("match.rematchLocked")
    : voteCount !== null && voteRequired !== null
      ? t("match.rematchProgress", { count: voteCount, required: voteRequired })
      : t("match.rematchIdle");

  return (
    <div className="screen match-summary-screen">
      <div className="match-summary-wrap">
        <div className="match-summary-card">
          <div className="confetti-container">
            {confetti.map((piece, index) => (
              <div
                key={index}
                className="confetti-piece"
                style={{
                  left: `${piece.left}%`,
                  animationDelay: `${piece.delay}s`,
                  background: piece.color,
                  width: `${piece.size}px`,
                  height: `${piece.size}px`,
                }}
              />
            ))}
          </div>

          <div className="match-summary-header">
            <span className="match-kicker">{isMyWin ? t("match.kickerWin") : t("match.kickerLoss")}</span>
            <h1 className="match-title">{isMyWin ? t("match.victory") : t("match.complete")}</h1>
            <p className="match-subtitle">
              {winner
                ? locale === "es"
                  ? `${seatLabel(ctx, winner.seat, locale)} terminó en cabeza. El primero en llegar a ${game.gameTarget} puntos.`
                  : `${seatLabel(ctx, winner.seat, locale)} finished on top. First to ${game.gameTarget} points.`
                : locale === "es"
                  ? `Meta: ${game.gameTarget} puntos`
                  : `Target: ${game.gameTarget} points`}
            </p>
          </div>

          <div className="match-winner">
            <span className="winner-badge" aria-hidden="true">
              🏆
            </span>
            <div className="winner-copy">
              <span className="winner-label">{t("match.winner")}</span>
              <span className="winner-name">{winner ? seatLabel(ctx, winner.seat, locale) : locale === "es" ? "Nadie" : "Nobody"}</span>
            </div>
            <div className="winner-score-block">
              <span className="winner-score-label">{t("match.finalScore")}</span>
              <span className="winner-score">
                {winner ? winner.score : 0}
                <small>pts</small>
              </span>
            </div>
          </div>

          <div className="match-summary-body">
            <section className="match-summary-panel">
              <h2 className="match-section-heading">{t("match.finalStandings")}</h2>
              <div className="leaderboard">
                {entries.map((entry, index) => (
                  <div
                    key={entry.seat}
                    className={`lb-row ${index === 0 ? "winner" : ""} ${
                      entry.seat === state.mySeat ? "self" : ""
                    }`}
                  >
                    <span className="lb-rank">#{index + 1}</span>
                    <div className="lb-player">
                      <span className="lb-name">{seatLabel(ctx, entry.seat, locale)}</span>
                      <div className="lb-tags">
                        {index === 0 ? <span className="lb-chip lb-chip-winner">{t("match.winnerBadge")}</span> : null}
                        {entry.seat === state.mySeat ? (
                          <span className="lb-chip lb-chip-self">{t("common.you")}</span>
                        ) : null}
                      </div>
                    </div>
                    <span className="lb-score">
                      {entry.score}
                      <small>pts</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <div className="match-summary-side">
              <section className="match-summary-panel">
                <h2 className="match-section-heading">{t("match.matchStats")}</h2>
                <div className="match-stats">
                  <div className="stat">
                    <span className="stat-label">{t("match.target")}</span>
                    <span className="stat-value">{game.gameTarget} pts</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">{t("match.handsPlayed")}</span>
                    <span className="stat-value">{game.handNo}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">{t("match.mode")}</span>
                    <span className="stat-value">{modeLabel(game.mode, locale)}</span>
                  </div>
                  {myPlacement >= 0 ? (
                    <div className="stat">
                      <span className="stat-label">{t("match.yourFinish")}</span>
                      <span className="stat-value">{formatPlacement(myPlacement + 1, locale)}</span>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="match-summary-panel">
                <h2 className="match-section-heading">{t("match.nextTable")}</h2>
                <p className="match-rematch-copy">{rematchCopy}</p>
              </section>
            </div>
          </div>

          <div className="match-actions">
            <button
              className={`primary rematch-btn ${hasVoted ? "voted" : ""}`}
              type="button"
              disabled={hasVoted}
              onClick={() => {
                if (hasVoted) return;
                setHasVoted(true);
                ctx.connection.send({ type: "REMATCH" });
              }}
            >
              {rematchLabel}
            </button>
            <button
              className="secondary leave-btn"
              type="button"
              onClick={() => {
                ctx.connection.send({ type: "LEAVE_ROOM" });
                ctx.state.reset();
                ctx.router.navigate("home");
              }}
            >
              {t("match.leaveRoom")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
