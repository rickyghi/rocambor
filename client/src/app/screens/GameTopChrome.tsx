import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { openProfileModal } from "../../components/profile/ProfileModal";
import type { SeatIndex } from "../../protocol";
import type { AppContext } from "../../router";
import type { ClientState } from "../../state";
import { openSettingsModal } from "../../ui/settings-modal";
import type { Settings } from "../../ui/settings";
import {
  useClientState,
  useConnectionSnapshot,
  useProfile,
  useSettings,
} from "../hooks";

interface HudPill {
  text: string;
  className?: string;
}

const GAME_LOGO_SRC = "/assets/rocambor/logo-light.png";

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

function suitIcon(suit: string): string {
  const icons: Record<string, string> = {
    oros: "♦",
    copas: "♥",
    espadas: "♠",
    bastos: "♣",
  };
  return icons[suit] || "";
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

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    dealing: "Dealing",
    auction: "Auction",
    penetro_choice: "Penetro Choice",
    trump_choice: "Choose Trump",
    exchange: "Exchange",
    play: "Play Trick",
    post_hand: "Hand Complete",
    match_end: "Match End",
  };
  return labels[phase] || phase;
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

function roleLabelForSeat(state: ClientState, seat: SeatIndex): string {
  const game = state.game;
  if (!game) return `Seat ${seat}`;
  if (game.resting === seat) return "RESTING";
  if (game.ombre === null) {
    return capLabel(state.relativePosition(seat)).toUpperCase();
  }
  if (seat === game.ombre) return "JUGADOR";
  const primer = nextActiveSeat(state, game.ombre);
  const segundo = nextActiveSeat(state, primer);
  if (seat === primer) return "PRIMER CONTR.";
  if (seat === segundo) return "SEGUNDO CONTR.";
  return capLabel(state.relativePosition(seat)).toUpperCase();
}

function seatLabelForAnnouncements(state: ClientState, seat: number): string {
  const game = state.game;
  if (!game) return `Seat ${seat}`;
  if (state.mySeat === seat) return "You";
  const role = roleLabelForSeat(state, seat as SeatIndex);
  const handle = game.players[seat]?.handle;
  if (handle) {
    if (role.startsWith("PRIMER")) return `Primer Contrincante (${handle})`;
    if (role.startsWith("SEGUNDO")) return `Segundo Contrincante (${handle})`;
    if (role === "JUGADOR") return `Jugador (${handle})`;
    return handle;
  }
  if (role === "JUGADOR") return "Jugador";
  if (role.startsWith("PRIMER")) return "Primer Contrincante";
  if (role.startsWith("SEGUNDO")) return "Segundo Contrincante";
  return `Seat ${seat}`;
}

function seatLabelShort(state: ClientState, seat: number): string {
  if (state.mySeat === seat) return "You";
  const handle = state.game?.players[seat]?.handle;
  return handle || `P${seat}`;
}

function turnActorLabelForHud(state: ClientState, turnSeat: number | null): string {
  if (turnSeat === null) return "Waiting";
  return seatLabelForAnnouncements(state, turnSeat);
}

function profileMetaLabel(roomCode: string | null): string {
  return roomCode ? `Room ${roomCode}` : "Table Player";
}

function buildHudPills(
  state: ClientState,
  now: number,
  compact: boolean
): HudPill[] {
  const game = state.game;
  if (!game) return [{ text: "Waiting..." }];

  const pills: HudPill[] = [];
  const isMyTurn = game.turn === state.mySeat;
  const turnName = turnActorLabelForHud(state, game.turn);
  const secs =
    typeof game.turnDeadline === "number"
      ? Math.max(0, Math.ceil((game.turnDeadline - now) / 1000))
      : null;
  const turnSuffix = secs !== null ? ` ${secs}s` : "";

  switch (game.phase) {
    case "auction": {
      pills.push({ text: compact ? `R: ${game.handNo}` : `Round ${game.handNo}/${game.gameTarget}` });
      if (!compact) pills.push({ text: "Phase: Auction" });
      pills.push({ text: `Target: ${game.gameTarget}` });
      if (!compact) {
        pills.push({
          text: game.trump
            ? `Trump: ${suitIcon(game.trump)} ${capSuit(game.trump)}`
            : "Trump: Undecided",
          className: game.trump ? "trump" : undefined,
        });
      }
      if (game.turn !== null) {
        const shortTurn = compact ? seatLabelShort(state, game.turn) : turnName;
        pills.push({
          text: compact ? `${shortTurn}${turnSuffix}` : `Turn: ${turnName}${turnSuffix}`,
          className: isMyTurn ? "hud-pill-active" : undefined,
        });
      }
      break;
    }

    case "play": {
      const totalTricksWon = Object.values(game.tricks).reduce((sum, value) => sum + value, 0);
      const currentTrick = totalTricksWon + 1;
      pills.push({
        text: compact ? `Trk ${currentTrick}/9` : `Trick ${currentTrick}/9`,
      });

      if (game.trump) {
        pills.push({
          text: compact
            ? `${suitIcon(game.trump)} ${capSuit(game.trump)}`
            : `Trump: ${suitIcon(game.trump)} ${capSuit(game.trump)}`,
          className: "trump",
        });
      }

      if (game.contract) {
        const contractLabel = contractDisplayLabel(game.contract, game.trump);
        const ombreName =
          game.ombre !== null
            ? compact
              ? seatLabelShort(state, game.ombre)
              : seatLabelForAnnouncements(state, game.ombre)
            : "";
        pills.push({
          text: ombreName ? `${ombreName}: ${contractLabel}` : contractLabel,
          className: "hud-pill-contract",
        });
      }

      if (game.turn !== null) {
        const shortTurn = compact ? seatLabelShort(state, game.turn) : turnName;
        pills.push({
          text: compact ? `${shortTurn}${turnSuffix}` : `Turn: ${turnName}${turnSuffix}`,
          className: isMyTurn ? "hud-pill-active" : undefined,
        });
      }
      break;
    }

    case "trump_choice": {
      pills.push({ text: compact ? "Choose Trump" : "Phase: Choose Trump" });
      if (game.turn !== null) {
        pills.push({
          text: `${turnName} choosing...`,
          className: isMyTurn ? "hud-pill-active" : undefined,
        });
      }
      break;
    }

    case "exchange": {
      if (!compact) pills.push({ text: "Phase: Exchange" });
      if (game.exchange.current !== null) {
        const exchName =
          game.exchange.current === state.mySeat
            ? "You"
            : compact
              ? seatLabelShort(state, game.exchange.current)
              : seatLabelForAnnouncements(state, game.exchange.current);
        pills.push({
          text: compact ? `${exchName} exchanging` : `Exchanging: ${exchName}`,
        });
      }
      pills.push({
        text: compact
          ? `Talon: ${game.exchange.talonSize}`
          : `Talon: ${game.exchange.talonSize} remaining`,
      });
      if (game.contract) {
        pills.push({
          text: contractDisplayLabel(game.contract, game.trump),
          className: "hud-pill-contract",
        });
      }
      break;
    }

    case "penetro_choice": {
      pills.push({ text: compact ? "Penetro" : "Phase: Penetro Choice" });
      if (game.turn !== null) {
        pills.push({
          text: `${turnName} deciding...`,
          className: isMyTurn ? "hud-pill-active" : undefined,
        });
      }
      break;
    }

    case "dealing": {
      pills.push({ text: compact ? `R: ${game.handNo}` : `Round ${game.handNo}/${game.gameTarget}` });
      pills.push({ text: "Dealing..." });
      break;
    }

    case "post_hand":
    case "scoring": {
      pills.push({ text: compact ? `R: ${game.handNo}` : `Round ${game.handNo}/${game.gameTarget}` });
      pills.push({ text: "Hand Complete" });
      pills.push({ text: `Target: ${game.gameTarget}` });
      break;
    }

    case "match_end": {
      pills.push({ text: "Match Complete" });
      break;
    }

    default: {
      pills.push({ text: compact ? `R: ${game.handNo}` : `Round ${game.handNo}/${game.gameTarget}` });
      pills.push({ text: phaseLabel(game.phase) });
      break;
    }
  }

  return pills;
}

function SoundOnIcon(): ReactElement {
  return (
    <svg
      className="header-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function SoundOffIcon(): ReactElement {
  return (
    <svg
      className="header-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

function SettingsIcon(): ReactElement {
  return (
    <svg
      className="header-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function GameTopChrome({ ctx }: { ctx: AppContext }): ReactElement {
  const state = useClientState(ctx.state);
  const profile = useProfile(ctx.profile);
  const settings = useSettings(ctx.settings);
  const { latencyMs } = useConnectionSnapshot(ctx.connection);
  const [now, setNow] = useState(() => Date.now());
  const [isMobilePortrait, setIsMobilePortrait] = useState(detectMobilePortrait);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

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

  const headerPills = buildHudPills(state, now, false);
  const mobilePills = isMobilePortrait ? buildHudPills(state, now, true) : [];
  const soundOn = settings.soundEnabled;
  const avatarSrc = profile.avatar || ctx.profile.getFallbackAvatar();
  const pingLabel = latencyMs === null ? "Ping --" : `Ping ${Math.round(latencyMs)}ms`;
  const profileMeta = profileMetaLabel(state.roomCode);

  return (
    <>
      <header className="game-header panel-noise rc-panel-noise">
        <div className="game-header-left">
          <button
            className="btn-ghost game-leave-btn"
            type="button"
            aria-label="Back to home"
            onClick={() => {
              ctx.connection.send({ type: "LEAVE_ROOM" });
            }}
          >
            ← Back
          </button>
          <div className="game-header-brand" aria-hidden="true">
            <img className="game-header-logo-mark" src={GAME_LOGO_SRC} alt="" />
          </div>
        </div>
        <div className="game-header-right">
          <button
            className="btn-ghost game-settings-btn"
            type="button"
            aria-label="Settings"
            onClick={() => {
              openSettingsModal(ctx.settings);
            }}
          >
            <SettingsIcon />
          </button>
          <button
            className="btn-ghost game-sound-btn"
            type="button"
            aria-label="Toggle sound"
            aria-pressed={soundOn}
            onClick={() => {
              ctx.settings.set(
                "soundEnabled",
                !settings.soundEnabled as Settings["soundEnabled"]
              );
            }}
          >
            {soundOn ? <SoundOnIcon /> : <SoundOffIcon />}
          </button>
          <span className="game-ping-chip" id="game-header-ping">
            {pingLabel}
          </span>
          <button
            className="btn-secondary game-profile-btn"
            type="button"
            onClick={() => {
              openProfileModal(ctx.profile);
            }}
          >
            <img
              className="game-profile-avatar"
              src={avatarSrc}
              alt=""
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = ctx.profile.getFallbackAvatar();
              }}
            />
            <span className="game-profile-copy">
              <span className="game-profile-name">{profile.name}</span>
              <span className="game-profile-meta">{profileMeta}</span>
            </span>
          </button>
        </div>
        <div className="game-header-hud-row">
          <div className="game-hud-shell">
            <div className="game-hud-bar" id="game-hud-bar" aria-live="polite">
              {headerPills.map((pill, index) => (
                <span
                  key={`${index}-${pill.text}`}
                  className={`hud-pill${pill.className ? ` ${pill.className}` : ""}`}
                >
                  {pill.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>
      <div className="game-mobile-summary rc-panel rc-panel-noise" id="game-mobile-summary">
        {mobilePills.map((pill, index) => (
          <span
            key={`mobile-${index}-${pill.text}`}
            className={`hud-pill${pill.className ? ` ${pill.className}` : ""}`}
          >
            {pill.text}
          </span>
        ))}
      </div>
    </>
  );
}
