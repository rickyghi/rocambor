import type { ReactElement } from "react";
import {
  bidDisplayLabel,
  contractDisplayLabel as localizedContractDisplayLabel,
  createTranslator,
  positionLabel,
} from "../../i18n";
import {
  buildBotAvatarUrl,
  buildDiceBearUrl,
  fallbackAvatarAt,
} from "../../lib/avatars";
import type { SeatIndex } from "../../protocol";
import type { AppContext } from "../../router";
import type { ClientState } from "../../state";
import { useClientState, useProfile, useSettings } from "../hooks";
import type { GameDomLayerBridge } from "./game-dom-layer-bridge";
import { useGameDomLayerSnapshot } from "./useGameDomLayerSnapshot";

function activeSeatsForRole(state: ClientState): SeatIndex[] {
  const game = state.game;
  if (!game) return [0, 1, 2];
  if (game.contract === "penetro") return [0, 1, 2, 3];
  return ([0, 1, 2, 3] as SeatIndex[])
    .filter((seat) => seat !== game.resting)
    .slice(0, 3);
}

function nextActiveSeat(state: ClientState, seat: SeatIndex): SeatIndex {
  const active = activeSeatsForRole(state);
  const idx = active.indexOf(seat);
  if (idx < 0) return active[0];
  return active[(idx + 1) % active.length];
}

type PlatePosition = "self" | "left" | "across" | "right";

function tablePositionLabel(position: PlatePosition, locale: "en" | "es"): string {
  return positionLabel(position, locale);
}

function roleSummaryLabel(state: ClientState, seat: SeatIndex, locale: "en" | "es"): string {
  const game = state.game;
  if (!game) return "";
  const { t } = createTranslator(locale);
  if (game.resting === seat) return t("game.resting");

  if (game.phase === "auction") {
    if (game.auction.passed.includes(seat)) return t("game.passed");
    if (game.auction.currentBidder === seat && game.auction.currentBid !== "pass") {
      return bidDisplayLabel(game.auction.currentBid, locale);
    }
    return t("game.waiting");
  }

  if (seat === game.ombre) {
    const contract = localizedContractDisplayLabel(game.contract, game.trump, locale);
    const playerLabel = locale === "es" ? "Jugador" : "Player";
    return contract ? `${playerLabel} · ${contract}` : playerLabel;
  }

  if (game.ombre === null) return "";

  const primer = nextActiveSeat(state, game.ombre);
  const segundo = nextActiveSeat(state, primer);
  if (seat === primer) return locale === "es" ? "Primer contra" : "First opponent";
  if (seat === segundo) return locale === "es" ? "Segundo contra" : "Second opponent";
  return locale === "es" ? "Contra" : "Opponent";
}

function trickDots(tricksWon: number): ReactElement[] {
  const maxDots = 9;
  const filled = Math.max(0, Math.min(maxDots, tricksWon));
  return Array.from({ length: maxDots }, (_, idx) => (
    <span
      key={idx}
      className={`hero-trick-dot${idx < filled ? " filled" : ""}`}
      aria-hidden="true"
    ></span>
  ));
}

function heroAvatarForSeat(
  ctx: AppContext,
  state: ClientState,
  profileName: string,
  profileAvatar: string,
  position: PlatePosition,
  locale: "en" | "es"
): { src: string; fallback: string } {
  const seat = state.seatAtPosition(position);
  if (seat === null) {
    return {
      src: ctx.profile.getFallbackAvatar(),
      fallback: ctx.profile.getFallbackAvatar(),
    };
  }

  if (position === "self") {
    const fallback = ctx.profile.getFallbackAvatar();
    return {
      src: profileAvatar || fallback,
      fallback,
    };
  }

  const game = state.game;
  const player = game?.players[seat];
  const name = player?.handle || `${locale === "es" ? "Asiento" : "Seat"} ${seat}`;
  const fallback = fallbackAvatarAt(seat);
  return {
    src: player?.isBot
      ? buildBotAvatarUrl(player.handle || `bot-${seat}`, seat, game?.roomCode || state.roomCode)
      : buildDiceBearUrl(name || `seat-${seat}`, "identicon"),
    fallback,
  };
}

function HeroPlate({
  ctx,
  state,
  profileName,
  profileAvatar,
  position,
  locale,
}: {
  ctx: AppContext;
  state: ClientState;
  profileName: string;
  profileAvatar: string;
  position: PlatePosition;
  locale: "en" | "es";
}): ReactElement | null {
  const game = state.game;
  if (!game) return null;

  const seat = state.seatAtPosition(position);
  if (seat === null) return null;

  const player = game.players[seat];
  const isSelf = position === "self";
  const { t } = createTranslator(locale);
  const name = isSelf ? profileName : player?.handle || `${locale === "es" ? "Asiento" : "Seat"} ${seat}`;
  const { src, fallback } = heroAvatarForSeat(
    ctx,
    state,
    profileName,
    profileAvatar,
    position,
    locale
  );
  const active = game.turn === seat ? " active-turn" : "";
  const resting = game.resting === seat ? " resting" : "";
  const disconnected = player && !player.connected ? " disconnected" : "";
  const tricks = game.tricks[seat] || 0;
  const sideClass = isSelf ? "" : " hero-side";
  const positionTag = tablePositionLabel(position, locale).toUpperCase();
  const roleText = roleSummaryLabel(state, seat, locale);
  const turnFlash = game.turn === seat;
  const ariaText = `${name}, ${positionTag.toLowerCase()}, ${roleText || (locale === "es" ? "en la mesa" : "at table")}, ${t("game.tricksWon", { count: tricks })}`;

  if (isSelf) {
    return (
      <section
        className={`hero-plate hero-self${active}${resting}${disconnected}`}
        aria-label={ariaText}
      >
        <div className="hero-header">
          <span className="hero-avatar-wrap">
            <img
              className="hero-avatar"
              src={src}
              alt=""
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = fallback;
              }}
            />
          </span>
          <div className="hero-copy">
            <div className="hero-meta-row">
              <span className="hero-position-tag you-tag">{positionTag}</span>
            </div>
            <span className="hero-name">{name}</span>
            {roleText ? <span className="hero-role-line">{roleText}</span> : null}
          </div>
          {turnFlash ? <span className="hero-turn-flash">{t("game.yourTurn")}</span> : null}
        </div>
        <div className="hero-trick-dots" aria-label={t("game.tricksWon", { count: tricks })}>
          {trickDots(tricks)}
        </div>
      </section>
    );
  }

  return (
    <section
      className={`hero-plate hero-${position}${sideClass}${active}${resting}${disconnected}`}
      aria-label={ariaText}
    >
      <div className="hero-header">
        <span className="hero-avatar-wrap">
          <img
            className="hero-avatar"
            src={src}
            alt=""
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = fallback;
            }}
          />
        </span>
        <div className="hero-copy">
          <div className="hero-meta-row">
            <span className="hero-position-tag">{positionTag}</span>
          </div>
          <span className="hero-name">{name}</span>
          {roleText ? <span className="hero-role-line">{roleText}</span> : null}
        </div>
      </div>
      <div className="hero-trick-dots" aria-label={t("game.tricksWon", { count: tricks })}>
        {trickDots(tricks)}
      </div>
    </section>
  );
}

export function GameOpponentsStrip({
  ctx,
  bridge,
}: {
  ctx: AppContext;
  bridge: GameDomLayerBridge;
}): ReactElement {
  const state = useClientState(ctx.state);
  const settings = useSettings(ctx.settings);
  const snapshot = useGameDomLayerSnapshot(bridge);
  const locale = settings.locale;
  const { t } = createTranslator(locale);

  const game = state.game;

  return (
    <div
      className="game-opponents-strip rc-panel rc-panel-noise"
      id="game-opponents-strip"
      role="list"
      aria-label={t("game.opponents")}
    >
      {snapshot.isMobilePortrait && game && state.mySeat !== null
        ? (["left", "across", "right"] as const).map((position) => {
            const seat = state.seatAtPosition(position);
            if (seat === null) return null;
            const player = game.players[seat];
            const name = player?.handle || `${locale === "es" ? "Asiento" : "Seat"} ${seat}`;
            const score = game.scores[seat] || 0;
            const tricks = game.tricks[seat] || 0;
            const active = game.turn === seat ? " active-turn" : "";
            const disconnected = player && !player.connected ? " disconnected" : "";
            const isOmbre = game.ombre === seat;
            const avatarUrl = player?.isBot
              ? buildBotAvatarUrl(
                  player.handle || `bot-${seat}`,
                  seat,
                  game.roomCode || state.roomCode
                )
              : buildDiceBearUrl(name || `seat-${seat}`, "identicon");
            const fallback = fallbackAvatarAt(seat);
            const bidTag =
              game.phase !== "auction"
                ? null
                : game.auction.passed.includes(seat)
                  ? { text: t("game.passed").toUpperCase(), className: "passed" }
                  : game.auction.currentBidder === seat && game.auction.currentBid !== "pass"
                    ? { text: bidDisplayLabel(game.auction.currentBid, locale), className: "active" }
                    : null;
            const ombreContractTag =
              isOmbre && game.contract
                ? localizedContractDisplayLabel(game.contract, game.trump, locale)
                : null;
            const tricksLabel = t("game.tricksShort", { count: tricks });
            const aria = `${positionLabel(position, locale)}, ${name}, ${locale === "es" ? "puntuación" : "score"} ${score}, ${locale === "es" ? "bazas" : "tricks"} ${tricks}`;

            return (
              <div
                key={seat}
                className={`mobile-opponent${active}${disconnected}`}
                role="listitem"
                aria-label={aria}
              >
                <div className="mob-opp-top">
                  <img
                    className="mobile-opponent-avatar"
                    src={avatarUrl}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = fallback;
                    }}
                  />
                  {isOmbre ? (
                    <span
                      className="mob-opp-crown"
                      aria-label={t("game.ombreRole")}
                      title={t("game.ombreRole")}
                    >
                      {t("game.ombreRole").toUpperCase()}
                    </span>
                  ) : null}
                </div>
                <span className="mobile-opponent-name">{name}</span>
                <div
                  className="mobile-opponent-stats"
                  aria-label={t("game.tricksWon", { count: tricks })}
                >
                  {bidTag ? (
                    <span className={`mob-bid-tag ${bidTag.className}`}>{bidTag.text}</span>
                  ) : null}
                  {ombreContractTag ? (
                    <span className="mob-ombre-tag">
                      {t("game.ombreRole").toUpperCase()} · {ombreContractTag}
                    </span>
                  ) : null}
                  <span className="mob-stat mob-stat-tricks">{tricksLabel}</span>
                </div>
              </div>
            );
          })
        : null}
    </div>
  );
}

export function GameHeroPlates({ ctx }: { ctx: AppContext }): ReactElement {
  const state = useClientState(ctx.state);
  const profile = useProfile(ctx.profile);
  const settings = useSettings(ctx.settings);

  return (
    <div className="hero-plates-layer" id="hero-plates-layer" aria-hidden="true">
      {state.game && state.mySeat !== null
        ? (["left", "across", "right"] as const).map((position) => (
            <HeroPlate
              key={position}
              ctx={ctx}
              state={state}
              profileName={profile.name}
              profileAvatar={profile.avatar}
              position={position}
              locale={settings.locale}
            />
          ))
        : null}
    </div>
  );
}

export function GameSelfHeroPlate({ ctx }: { ctx: AppContext }): ReactElement {
  const state = useClientState(ctx.state);
  const profile = useProfile(ctx.profile);
  const settings = useSettings(ctx.settings);

  return (
    <div className="hero-self-slot" id="hero-self-slot" aria-hidden="true">
      {state.game && state.mySeat !== null ? (
        <HeroPlate
          ctx={ctx}
          state={state}
          profileName={profile.name}
          profileAvatar={profile.avatar}
          position="self"
          locale={settings.locale}
        />
      ) : null}
    </div>
  );
}
