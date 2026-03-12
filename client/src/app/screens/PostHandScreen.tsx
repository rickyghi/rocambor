import type { ReactElement } from "react";
import { useEffect, useMemo } from "react";
import type { GameState, SeatIndex } from "../../protocol";
import type { AppContext } from "../../router";
import { useClientState } from "../hooks";
import "../../screens/post-hand.css";

const trumpSymbols: Record<string, string> = {
  oros: "♦ Oros",
  copas: "♥ Copas",
  espadas: "♠ Espadas",
  bastos: "♣ Bastos",
};

const contractLabels: Record<string, string> = {
  entrada: "Entrada",
  volteo: "Volteo",
  solo: "Solo",
  oros: "Oros",
  solo_oros: "Solo Oros",
  bola: "Bola",
  contrabola: "Contrabola",
  penetro: "Penetro",
};

function seatLabel(ctx: AppContext, seat: SeatIndex | null): string {
  if (seat === null) return "...";
  if (seat === ctx.state.mySeat) return "You";
  const player = ctx.state.game?.players[seat];
  return player?.handle || `Seat ${seat}`;
}

function getResultText(ctx: AppContext, game: GameState): string {
  if (game.ombre === null) return "Hand Complete";

  const ombreTricks = game.tricks[game.ombre] || 0;
  const isOmbreSelf = game.ombre === ctx.state.mySeat;

  if (game.contract === "bola") {
    return ombreTricks === 9
      ? isOmbreSelf
        ? "Bola Made!"
        : `${seatLabel(ctx, game.ombre)} made Bola!`
      : isOmbreSelf
        ? "Bola Failed"
        : `${seatLabel(ctx, game.ombre)} failed Bola`;
  }

  if (game.contract === "contrabola") {
    return ombreTricks === 0
      ? isOmbreSelf
        ? "Contrabola Made!"
        : `${seatLabel(ctx, game.ombre)} made Contrabola!`
      : isOmbreSelf
        ? "Contrabola Failed"
        : `${seatLabel(ctx, game.ombre)} failed Contrabola`;
  }

  if (ombreTricks >= 5) {
    return isOmbreSelf ? "Sacada! You won!" : `${seatLabel(ctx, game.ombre)} won (Sacada)`;
  }

  const anyOpponentOver5 = Object.entries(game.tricks)
    .filter(([seat]) => Number(seat) !== game.ombre && Number(seat) !== game.resting)
    .some(([, tricks]) => (tricks as number) >= 5);

  if (anyOpponentOver5) {
    return isOmbreSelf
      ? "Codille! You lost..."
      : `Codille against ${seatLabel(ctx, game.ombre)}`;
  }

  return isOmbreSelf
    ? "Puesta - draw"
    : `Puesta - ${seatLabel(ctx, game.ombre)} tied`;
}

function getResultClass(ctx: AppContext, game: GameState): string {
  if (game.ombre === null) return "";

  const ombreTricks = game.tricks[game.ombre] || 0;
  const isOmbreSelf = game.ombre === ctx.state.mySeat;

  if (game.contract === "bola") {
    return ombreTricks === 9
      ? isOmbreSelf
        ? "result-win"
        : "result-loss"
      : isOmbreSelf
        ? "result-loss"
        : "result-win";
  }

  if (game.contract === "contrabola") {
    return ombreTricks === 0
      ? isOmbreSelf
        ? "result-win"
        : "result-loss"
      : isOmbreSelf
        ? "result-loss"
        : "result-win";
  }

  if (ombreTricks >= 5) return isOmbreSelf ? "result-win" : "result-loss";
  return isOmbreSelf ? "result-loss" : "result-neutral";
}

export function PostHandScreen({ ctx }: { ctx: AppContext }): ReactElement | null {
  const state = useClientState(ctx.state);
  const game = state.game;

  useEffect(() => {
    if (!game) {
      ctx.router.navigate("home");
      return;
    }
    if (game.phase === "match_end") {
      ctx.router.navigate("match-summary");
    } else if (game.phase !== "post_hand" && game.phase !== "scoring") {
      ctx.router.navigate("game");
    }
  }, [ctx.router, game]);

  useEffect(() => {
    if (game) ctx.sounds.trickWin();
  }, [ctx.sounds, game?.handNo]);

  const activeRows = useMemo(() => {
    if (!game) return [];
    return ([0, 1, 2, 3] as SeatIndex[]).filter((seat) => game.resting !== seat);
  }, [game]);

  const highestScore = useMemo(() => {
    if (!game) return 0;
    const scores = ([0, 1, 2, 3] as SeatIndex[])
      .filter((seat) => Boolean(game.players[seat]))
      .map((seat) => game.scores[seat] || 0);
    return scores.length > 0 ? Math.max(...scores) : 0;
  }, [game]);

  if (!game) return null;

  const resultText = getResultText(ctx, game);
  const resultClass = getResultClass(ctx, game);
  const restingLabel = game.resting !== null ? seatLabel(ctx, game.resting) : null;

  return (
    <div className="screen post-hand-screen">
      <div className="post-hand-overlay">
        <div className="post-hand-card">
          <div className="post-hand-header">
            <span className="post-hand-kicker">Hand {game.handNo}</span>
            <h2>Hand Complete</h2>
            <p className="post-hand-subtitle">
              Scores are settled and the next deal will begin automatically.
            </p>
          </div>

          <div className={`post-hand-result ${resultClass}`}>
            <span className="post-hand-result-label">Outcome</span>
            <span className="post-hand-result-value">{resultText}</span>
          </div>

          <div className="post-hand-details">
            <div className="detail-row">
              <span className="detail-label">Contract</span>
              <span className="detail-value">
                {contractLabels[game.contract || ""] || game.contract || "-"}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Trump</span>
              <span className="detail-value">{trumpSymbols[game.trump || ""] || "-"}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Jugador</span>
              <span className="detail-value">{seatLabel(ctx, game.ombre)}</span>
            </div>
            {restingLabel ? (
              <div className="detail-row">
                <span className="detail-label">Resting</span>
                <span className="detail-value">{restingLabel}</span>
              </div>
            ) : null}
          </div>

          <div className="post-hand-sections">
            <section className="post-hand-panel">
              <h3 className="post-hand-section-heading">Tricks Won</h3>
              <div className="tricks-table">
                {activeRows.map((seat) => (
                  <div key={seat} className={`trick-row ${game.ombre === seat ? "ombre" : ""}`}>
                    <span className="trick-name">
                      {seatLabel(ctx, seat)}
                      {game.ombre === seat ? " (Jugador)" : ""}
                    </span>
                    <span className="trick-count">{game.tricks[seat] || 0}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="post-hand-panel">
              <h3 className="post-hand-section-heading">Match Scores</h3>
              <div className="scores-table">
                {([0, 1, 2, 3] as SeatIndex[])
                  .filter((seat) => Boolean(game.players[seat]))
                  .map((seat) => (
                    <div
                      key={seat}
                      className={`score-row ${state.mySeat === seat ? "self" : ""} ${
                        (game.scores[seat] || 0) === highestScore ? "leader" : ""
                      }`}
                    >
                      <span className="score-name">{seatLabel(ctx, seat)}</span>
                      <span className="score-value">{game.scores[seat] || 0}</span>
                    </div>
                  ))}
              </div>
            </section>
          </div>

          <div className="post-hand-footer">
            <div className="post-hand-hint">Next hand starting shortly</div>
          </div>
        </div>
      </div>
    </div>
  );
}
