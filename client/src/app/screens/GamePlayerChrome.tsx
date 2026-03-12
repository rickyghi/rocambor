import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  buildBotAvatarUrl,
  buildDiceBearUrl,
  fallbackAvatarAt,
} from "../../lib/avatars";
import type { SeatIndex } from "../../protocol";
import type { AppContext } from "../../router";
import type { ClientState } from "../../state";
import { useClientState, useProfile } from "../hooks";

function detectMobilePortrait(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width: 900px)").matches &&
    window.matchMedia("(orientation: portrait)").matches
  );
}

function capSuit(suit: string): string {
  return suit.charAt(0).toUpperCase() + suit.slice(1);
}

function bidLabel(value: string): string {
  const labels: Record<string, string> = {
    pass: "Pass",
    entrada: "Entrada",
    oros: "Entrada Oros",
    volteo: "Volteo",
    solo: "Solo",
    solo_oros: "Solo Oros",
    contrabola: "Contrabola",
    bola: "Bola",
  };
  return labels[value] || value;
}

function contractDisplayLabel(contract: string | null, trump: string | null): string {
  if (!contract) return "";
  const labels: Record<string, string> = {
    entrada: "Entrada",
    volteo: "Volteo",
    solo: "Solo",
    oros: "Oros",
    solo_oros: "Solo Oros",
    contrabola: "Contrabola",
    bola: "Bola",
    penetro: "Penetro",
  };
  const base = labels[contract] ?? contract;
  if (trump && !["oros", "solo_oros", "contrabola", "bola"].includes(contract)) {
    return `${base} ${capSuit(trump)}`;
  }
  return base;
}

function capLabel(pos: "left" | "across" | "right" | "self"): string {
  const map: Record<typeof pos, string> = {
    self: "You",
    left: "Left",
    across: "Across",
    right: "Right",
  };
  return map[pos];
}

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

function tablePositionLabel(position: PlatePosition): string {
  if (position === "self") return "You";
  return capLabel(position);
}

function roleSummaryLabel(state: ClientState, seat: SeatIndex): string {
  const game = state.game;
  if (!game) return "";
  if (game.resting === seat) return "Resting";

  if (game.phase === "auction") {
    if (game.auction.passed.includes(seat)) return "Passed";
    if (game.auction.currentBidder === seat && game.auction.currentBid !== "pass") {
      return bidLabel(game.auction.currentBid);
    }
    return "Waiting";
  }

  if (seat === game.ombre) {
    const contract = contractDisplayLabel(game.contract, game.trump);
    return contract ? `Jugador · ${contract}` : "Jugador";
  }

  if (game.ombre === null) return "";

  const primer = nextActiveSeat(state, game.ombre);
  const segundo = nextActiveSeat(state, primer);
  if (seat === primer) return "Primer Contra";
  if (seat === segundo) return "Segundo Contra";
  return "Contra";
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
  position: PlatePosition
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
  const name = player?.handle || `Seat ${seat}`;
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
}: {
  ctx: AppContext;
  state: ClientState;
  profileName: string;
  profileAvatar: string;
  position: PlatePosition;
}): ReactElement | null {
  const game = state.game;
  if (!game) return null;

  const seat = state.seatAtPosition(position);
  if (seat === null) return null;

  const player = game.players[seat];
  const isSelf = position === "self";
  const name = isSelf ? profileName : player?.handle || `Seat ${seat}`;
  const { src, fallback } = heroAvatarForSeat(
    ctx,
    state,
    profileName,
    profileAvatar,
    position
  );
  const active = game.turn === seat ? " active-turn" : "";
  const resting = game.resting === seat ? " resting" : "";
  const disconnected = player && !player.connected ? " disconnected" : "";
  const tricks = game.tricks[seat] || 0;
  const sideClass = isSelf ? "" : " hero-side";
  const positionTag = tablePositionLabel(position).toUpperCase();
  const roleText = roleSummaryLabel(state, seat);
  const turnFlash = game.turn === seat;
  const ariaText = `${name}, ${positionTag.toLowerCase()}, ${roleText || "at table"}, tricks ${tricks}`;

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
          {turnFlash ? <span className="hero-turn-flash">YOUR TURN</span> : null}
        </div>
        <div className="hero-trick-dots" aria-label={`Tricks won: ${tricks}`}>
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
      <div className="hero-trick-dots" aria-label={`Tricks won: ${tricks}`}>
        {trickDots(tricks)}
      </div>
    </section>
  );
}

export function GameOpponentsStrip({ ctx }: { ctx: AppContext }): ReactElement {
  const state = useClientState(ctx.state);
  const [isMobilePortrait, setIsMobilePortrait] = useState(detectMobilePortrait);

  useEffect(() => {
    const refresh = (): void => {
      setIsMobilePortrait(detectMobilePortrait());
    };

    refresh();
    window.addEventListener("resize", refresh);
    return () => {
      window.removeEventListener("resize", refresh);
    };
  }, []);

  const game = state.game;

  return (
    <div
      className="game-opponents-strip rc-panel rc-panel-noise"
      id="game-opponents-strip"
      role="list"
      aria-label="Opponents"
    >
      {isMobilePortrait && game && state.mySeat !== null
        ? (["left", "across", "right"] as const).map((position) => {
            const seat = state.seatAtPosition(position);
            if (seat === null) return null;
            const player = game.players[seat];
            const name = player?.handle || `Seat ${seat}`;
            const score = game.scores[seat] || 0;
            const tricks = game.tricks[seat] || 0;
            const cards = game.handsCount[seat] || 0;
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
                  ? { text: "PASSED", className: "passed" }
                  : game.auction.currentBidder === seat && game.auction.currentBid !== "pass"
                    ? { text: bidLabel(game.auction.currentBid), className: "active" }
                    : null;
            const ombreContractTag =
              isOmbre && game.contract ? contractDisplayLabel(game.contract, game.trump) : null;
            const aria = `${position} ${name}, score ${score}, tricks ${tricks}, cards ${cards}`;

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
                    <span className="mob-opp-crown" aria-label="Ombre" title="Ombre">
                      &#9830;
                    </span>
                  ) : null}
                </div>
                <span className="mobile-opponent-name">{name}</span>
                {bidTag ? (
                  <span className={`mob-bid-tag ${bidTag.className}`}>{bidTag.text}</span>
                ) : null}
                {ombreContractTag ? (
                  <span className="mob-ombre-tag">{ombreContractTag}</span>
                ) : null}
                <div className="mob-opp-card-lines" aria-label={`Cards: ${cards}`}>
                  {Array.from({ length: Math.min(cards, 9) }, (_, idx) => (
                    <span key={idx} className="mob-card-line"></span>
                  ))}
                </div>
                <div className="mobile-opponent-stats">
                  <span className="mob-stat">Pts: {score}</span>
                  <span className="mob-stat">Trk: {tricks}</span>
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
            />
          ))
        : null}
    </div>
  );
}

export function GameSelfHeroPlate({ ctx }: { ctx: AppContext }): ReactElement {
  const state = useClientState(ctx.state);
  const profile = useProfile(ctx.profile);

  return (
    <div className="hero-self-slot" id="hero-self-slot" aria-hidden="true">
      {state.game && state.mySeat !== null ? (
        <HeroPlate
          ctx={ctx}
          state={state}
          profileName={profile.name}
          profileAvatar={profile.avatar}
          position="self"
        />
      ) : null}
    </div>
  );
}
