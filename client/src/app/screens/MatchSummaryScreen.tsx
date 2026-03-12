import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SeatIndex } from "../../protocol";
import type { AppContext } from "../../router";
import { recordProfileMatch } from "../../lib/profile-history";
import { useClientState } from "../hooks";
import "../../screens/match-summary.css";

function seatLabel(ctx: AppContext, seat: SeatIndex | null): string {
  if (seat === null) return "...";
  if (seat === ctx.state.mySeat) return "You";
  const player = ctx.state.game?.players[seat];
  return player?.handle || `Seat ${seat}`;
}

function buildConfettiPieces(): Array<{
  color: string;
  left: number;
  delay: number;
  size: number;
}> {
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

function formatPlacement(place: number): string {
  const remainder = place % 10;
  const teen = place % 100;
  if (teen >= 11 && teen <= 13) return `${place}th`;
  if (remainder === 1) return `${place}st`;
  if (remainder === 2) return `${place}nd`;
  if (remainder === 3) return `${place}rd`;
  return `${place}th`;
}

export function MatchSummaryScreen({ ctx }: { ctx: AppContext }): ReactElement | null {
  const state = useClientState(ctx.state);
  const game = state.game;
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
      ? `Play Again (${voteCount}/${voteRequired})`
      : hasVoted
        ? "Voted - waiting..."
        : voteCount !== null && voteRequired !== null
          ? `Play Again (${voteCount}/${voteRequired})`
          : "Play Again";
  const rematchCopy = hasVoted
    ? "Your rematch vote is locked in. The room will restart once the table agrees."
    : voteCount !== null && voteRequired !== null
      ? `${voteCount} of ${voteRequired} players are ready for another round.`
      : "Stay with this table for an instant rematch or leave the room.";

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
            <span className="match-kicker">{isMyWin ? "Rocambor Crown" : "Final Table"}</span>
            <h1 className="match-title">{isMyWin ? "Victory!" : "Match Complete"}</h1>
            <p className="match-subtitle">
              {winner
                ? `${seatLabel(ctx, winner.seat)} finished on top. First to ${game.gameTarget} points.`
                : `Target: ${game.gameTarget} points`}
            </p>
          </div>

          <div className="match-winner">
            <span className="winner-badge" aria-hidden="true">
              🏆
            </span>
            <div className="winner-copy">
              <span className="winner-label">Winner</span>
              <span className="winner-name">{winner ? seatLabel(ctx, winner.seat) : "Nobody"}</span>
            </div>
            <div className="winner-score-block">
              <span className="winner-score-label">Final Score</span>
              <span className="winner-score">
                {winner ? winner.score : 0}
                <small>pts</small>
              </span>
            </div>
          </div>

          <div className="match-summary-body">
            <section className="match-summary-panel">
              <h2 className="match-section-heading">Final Standings</h2>
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
                      <span className="lb-name">{seatLabel(ctx, entry.seat)}</span>
                      <div className="lb-tags">
                        {index === 0 ? <span className="lb-chip lb-chip-winner">Winner</span> : null}
                        {entry.seat === state.mySeat ? (
                          <span className="lb-chip lb-chip-self">You</span>
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
                <h2 className="match-section-heading">Match Stats</h2>
                <div className="match-stats">
                  <div className="stat">
                    <span className="stat-label">Target</span>
                    <span className="stat-value">{game.gameTarget} pts</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Hands Played</span>
                    <span className="stat-value">{game.handNo}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Mode</span>
                    <span className="stat-value">
                      {game.mode === "tresillo" ? "Tresillo" : "Quadrille"}
                    </span>
                  </div>
                  {myPlacement >= 0 ? (
                    <div className="stat">
                      <span className="stat-label">Your Finish</span>
                      <span className="stat-value">{formatPlacement(myPlacement + 1)}</span>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="match-summary-panel">
                <h2 className="match-section-heading">Next Table</h2>
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
              Leave Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
