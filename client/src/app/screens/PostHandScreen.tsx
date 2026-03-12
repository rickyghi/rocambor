import type { ReactElement } from "react";
import { useEffect, useMemo } from "react";
import { contractDisplayLabel, createTranslator, suitLabel } from "../../i18n";
import type { GameState, SeatIndex } from "../../protocol";
import type { AppContext } from "../../router";
import { useClientState, useSettings } from "../hooks";
import "../../screens/post-hand.css";

function seatLabel(ctx: AppContext, seat: SeatIndex | null, locale: "en" | "es"): string {
  if (seat === null) return "...";
  if (seat === ctx.state.mySeat) return locale === "es" ? "Tú" : "You";
  const player = ctx.state.game?.players[seat];
  return player?.handle || `${locale === "es" ? "Asiento" : "Seat"} ${seat}`;
}

function getResultText(ctx: AppContext, game: GameState, locale: "en" | "es"): string {
  if (game.ombre === null) return locale === "es" ? "Mano terminada" : "Hand Complete";

  const ombreTricks = game.tricks[game.ombre] || 0;
  const isOmbreSelf = game.ombre === ctx.state.mySeat;
  const ombreName = seatLabel(ctx, game.ombre, locale);

  if (game.contract === "bola") {
    return ombreTricks === 9
      ? isOmbreSelf
        ? locale === "es"
          ? "¡Bola conseguida!"
          : "Bola Made!"
        : locale === "es"
          ? `${ombreName} logró Bola`
          : `${ombreName} made Bola!`
      : isOmbreSelf
        ? locale === "es"
          ? "Bola fallida"
          : "Bola Failed"
        : locale === "es"
          ? `${ombreName} falló Bola`
          : `${ombreName} failed Bola`;
  }

  if (game.contract === "contrabola") {
    return ombreTricks === 0
      ? isOmbreSelf
        ? locale === "es"
          ? "¡Contrabola conseguida!"
          : "Contrabola Made!"
        : locale === "es"
          ? `${ombreName} logró Contrabola`
          : `${ombreName} made Contrabola!`
      : isOmbreSelf
        ? locale === "es"
          ? "Contrabola fallida"
          : "Contrabola Failed"
        : locale === "es"
          ? `${ombreName} falló Contrabola`
          : `${ombreName} failed Contrabola`;
  }

  if (ombreTricks >= 5) {
    return isOmbreSelf
      ? locale === "es"
        ? "¡Sacada! Has ganado"
        : "Sacada! You won!"
      : locale === "es"
        ? `${ombreName} ganó (Sacada)`
        : `${ombreName} won (Sacada)`;
  }

  const anyOpponentOver5 = Object.entries(game.tricks)
    .filter(([seat]) => Number(seat) !== game.ombre && Number(seat) !== game.resting)
    .some(([, tricks]) => (tricks as number) >= 5);

  if (anyOpponentOver5) {
    return isOmbreSelf
      ? locale === "es"
        ? "¡Codille! Has perdido"
        : "Codille! You lost..."
      : locale === "es"
        ? `Codille contra ${ombreName}`
        : `Codille against ${ombreName}`;
  }

  return isOmbreSelf
    ? locale === "es"
      ? "Puesta - empate"
      : "Puesta - draw"
    : locale === "es"
      ? `Puesta - empate de ${ombreName}`
      : `Puesta - ${ombreName} tied`;
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
  const settings = useSettings(ctx.settings);
  const game = state.game;
  const locale = settings.locale;
  const { t } = createTranslator(locale);

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

  const resultText = getResultText(ctx, game, locale);
  const resultClass = getResultClass(ctx, game);
  const restingLabel = game.resting !== null ? seatLabel(ctx, game.resting, locale) : null;

  return (
    <div className="screen post-hand-screen">
      <div className="post-hand-overlay">
        <div className="post-hand-card">
          <div className="post-hand-header">
            <span className="post-hand-kicker">{locale === "es" ? `Mano ${game.handNo}` : `Hand ${game.handNo}`}</span>
            <h2>{t("game.handComplete")}</h2>
            <p className="post-hand-subtitle">
              {t("postHand.subtitle")}
            </p>
          </div>

          <div className={`post-hand-result ${resultClass}`}>
            <span className="post-hand-result-label">{t("postHand.outcome")}</span>
            <span className="post-hand-result-value">{resultText}</span>
          </div>

          <div className="post-hand-details">
            <div className="detail-row">
              <span className="detail-label">{t("postHand.contract")}</span>
              <span className="detail-value">
                {contractDisplayLabel(game.contract, game.trump, locale) || game.contract || "-"}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">{t("postHand.trump")}</span>
              <span className="detail-value">
                {game.trump ? `${game.trump === "oros" ? "♦" : game.trump === "copas" ? "♥" : game.trump === "espadas" ? "♠" : "♣"} ${suitLabel(game.trump, locale)}` : "-"}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">{t("postHand.jugador")}</span>
              <span className="detail-value">{seatLabel(ctx, game.ombre, locale)}</span>
            </div>
            {restingLabel ? (
              <div className="detail-row">
                <span className="detail-label">{t("postHand.resting")}</span>
                <span className="detail-value">{restingLabel}</span>
              </div>
            ) : null}
          </div>

          <div className="post-hand-sections">
            <section className="post-hand-panel">
              <h3 className="post-hand-section-heading">{t("postHand.tricksWon")}</h3>
              <div className="tricks-table">
                {activeRows.map((seat) => (
                  <div key={seat} className={`trick-row ${game.ombre === seat ? "ombre" : ""}`}>
                    <span className="trick-name">
                      {seatLabel(ctx, seat, locale)}
                      {game.ombre === seat ? ` (${t("postHand.jugador")})` : ""}
                    </span>
                    <span className="trick-count">{game.tricks[seat] || 0}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="post-hand-panel">
              <h3 className="post-hand-section-heading">{t("postHand.matchScores")}</h3>
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
                      <span className="score-name">{seatLabel(ctx, seat, locale)}</span>
                      <span className="score-value">{game.scores[seat] || 0}</span>
                    </div>
                  ))}
              </div>
            </section>
          </div>

          <div className="post-hand-footer">
            <div className="post-hand-hint">{t("postHand.nextHand")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
