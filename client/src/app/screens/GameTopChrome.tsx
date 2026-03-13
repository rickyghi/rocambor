import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  bidDisplayLabel,
  contractDisplayLabel as localizedContractDisplayLabel,
  createTranslator,
  phaseDisplayLabel,
  positionLabel,
  suitLabel,
} from "../../i18n";
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
import type { GameDomLayerBridge } from "./game-dom-layer-bridge";
import { useGameDomLayerSnapshot } from "./useGameDomLayerSnapshot";

interface HudPill {
  text: string;
  className?: string;
}

const GAME_LOGO_SRC = "/assets/rocambor/logo-light.png";

function suitIcon(suit: string): string {
  const icons: Record<string, string> = {
    oros: "♦",
    copas: "♥",
    espadas: "♠",
    bastos: "♣",
  };
  return icons[suit] || "";
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

function roleLabelForSeat(state: ClientState, seat: SeatIndex, locale: "en" | "es"): string {
  const game = state.game;
  if (!game) return locale === "es" ? `Asiento ${seat}` : `Seat ${seat}`;
  if (game.resting === seat) return createTranslator(locale).t("game.resting").toUpperCase();
  if (game.ombre === null) {
    return positionLabel(state.relativePosition(seat), locale).toUpperCase();
  }
  if (seat === game.ombre) return locale === "es" ? "JUGADOR" : "PLAYER";
  const primer = nextActiveSeat(state, game.ombre);
  const segundo = nextActiveSeat(state, primer);
  if (seat === primer) return locale === "es" ? "PRIMER CONTR." : "FIRST OPP.";
  if (seat === segundo) return locale === "es" ? "SEGUNDO CONTR." : "SECOND OPP.";
  return positionLabel(state.relativePosition(seat), locale).toUpperCase();
}

function seatLabelForAnnouncements(state: ClientState, seat: number, locale: "en" | "es"): string {
  const game = state.game;
  if (!game) return locale === "es" ? `Asiento ${seat}` : `Seat ${seat}`;
  if (state.mySeat === seat) return locale === "es" ? "Tú" : "You";
  const handle = game.players[seat]?.handle;
  const playerLabel = locale === "es" ? "Jugador" : "Player";
  const firstOppLabel = locale === "es" ? "Primer contra" : "First opponent";
  const secondOppLabel = locale === "es" ? "Segundo contra" : "Second opponent";
  if (seat === game.ombre) return handle ? `${playerLabel} (${handle})` : playerLabel;
  if (game.ombre !== null) {
    const primer = nextActiveSeat(state, game.ombre);
    const segundo = nextActiveSeat(state, primer);
    if (seat === primer) return handle ? `${firstOppLabel} (${handle})` : firstOppLabel;
    if (seat === segundo) return handle ? `${secondOppLabel} (${handle})` : secondOppLabel;
  }
  if (handle) {
    return handle;
  }
  return locale === "es" ? `Asiento ${seat}` : `Seat ${seat}`;
}

function seatLabelShort(state: ClientState, seat: number, locale: "en" | "es"): string {
  if (state.mySeat === seat) return locale === "es" ? "Tú" : "You";
  const handle = state.game?.players[seat]?.handle;
  return handle || `P${seat}`;
}

function turnActorLabelForHud(
  state: ClientState,
  turnSeat: number | null,
  locale: "en" | "es"
): string {
  if (turnSeat === null) return createTranslator(locale).t("game.waiting");
  return seatLabelForAnnouncements(state, turnSeat, locale);
}

function profileMetaLabel(roomCode: string | null, locale: "en" | "es"): string {
  const { t } = createTranslator(locale);
  return roomCode ? t("game.profileMeta", { code: roomCode }) : t("game.profileMetaFallback");
}

function buildHudPills(
  state: ClientState,
  now: number,
  compact: boolean,
  locale: "en" | "es"
): HudPill[] {
  const { t } = createTranslator(locale);
  const game = state.game;
  if (!game) return [{ text: t("game.waiting") }];

  const pills: HudPill[] = [];
  const isMyTurn = game.turn === state.mySeat;
  const compactTurnText =
    game.turn === null ? t("game.waiting") : isMyTurn ? t("common.you") : seatLabelShort(state, game.turn, locale);
  const turnName = turnActorLabelForHud(state, game.turn, locale);
  const secs =
    typeof game.turnDeadline === "number"
      ? Math.max(0, Math.ceil((game.turnDeadline - now) / 1000))
      : null;
  const turnSuffix = secs !== null ? ` ${secs}s` : "";

  switch (game.phase) {
    case "auction": {
      if (compact) {
        pills.push({ text: t("game.auction") });
        if (game.auction.currentBid !== "pass" && game.auction.currentBidder !== null) {
          pills.push({
            text: `${seatLabelShort(state, game.auction.currentBidder, locale)} · ${bidDisplayLabel(
              game.auction.currentBid,
              locale
            )}`,
            className: "hud-pill-contract",
          });
        } else {
          pills.push({
            text: t("game.roundShort", { hand: game.handNo, target: game.gameTarget }),
          });
        }
        if (game.turn !== null) {
          pills.push({
            text: compactTurnText,
            className: isMyTurn ? "hud-pill-active" : undefined,
          });
        }
        break;
      }

      pills.push({
        text: t("game.round", { hand: game.handNo, target: game.gameTarget }),
      });
      pills.push({ text: t("game.phaseAuction") });
      pills.push({ text: t("game.target", { target: game.gameTarget }) });
      pills.push({
        text: game.trump
          ? t("game.trump", { suit: `${suitIcon(game.trump)} ${suitLabel(game.trump, locale)}` })
          : t("game.trumpUndecided"),
        className: game.trump ? "trump" : undefined,
      });
      if (game.turn !== null) {
        pills.push({
          text: t("game.turn", { name: turnName, suffix: turnSuffix }),
          className: isMyTurn ? "hud-pill-active" : undefined,
        });
      }
      break;
    }

    case "play": {
      const totalTricksWon = Object.values(game.tricks).reduce((sum, value) => sum + value, 0);
      const currentTrick = totalTricksWon + 1;
      pills.push({
        text: compact
          ? locale === "es"
            ? `Baza ${currentTrick}/9`
            : `Trk ${currentTrick}/9`
          : `${locale === "es" ? "Baza" : "Trick"} ${currentTrick}/9`,
      });

      if (game.trump) {
        pills.push({
          text: compact
            ? `${suitIcon(game.trump)} ${suitLabel(game.trump, locale)}`
            : t("game.trump", { suit: `${suitIcon(game.trump)} ${suitLabel(game.trump, locale)}` }),
          className: "trump",
        });
      }

      if (compact) {
        if (game.contract && game.ombre !== null) {
          const ombreName =
            game.ombre === state.mySeat
              ? t("common.you")
              : seatLabelShort(state, game.ombre, locale);
          pills.push({
            text: `${t("game.ombreRole")} · ${ombreName} · ${localizedContractDisplayLabel(
              game.contract,
              game.trump,
              locale
            )}`,
            className: "hud-pill-contract",
          });
        }
        if (game.turn !== null) {
          pills.push({
            text: compactTurnText,
            className: isMyTurn ? "hud-pill-active" : undefined,
          });
        }
      } else if (game.contract) {
        const contractLabel = localizedContractDisplayLabel(game.contract, game.trump, locale);
        const ombreName =
          game.ombre !== null
            ? compact
              ? seatLabelShort(state, game.ombre, locale)
              : seatLabelForAnnouncements(state, game.ombre, locale)
            : "";
        pills.push({
          text: ombreName ? `${ombreName}: ${contractLabel}` : contractLabel,
          className: "hud-pill-contract",
        });
      }

      if (!compact && game.turn !== null) {
        pills.push({
          text: t("game.turn", { name: turnName, suffix: turnSuffix }),
          className: isMyTurn ? "hud-pill-active" : undefined,
        });
      }
      break;
    }

    case "trump_choice": {
      pills.push({ text: compact ? t("game.chooseTrump") : t("game.phaseChooseTrump") });
      if (compact && game.turn !== null) {
        pills.push({
          text: compactTurnText,
          className: isMyTurn ? "hud-pill-active" : undefined,
        });
      } else if (!compact && game.turn !== null) {
        pills.push({
          text: t("game.deciding", { name: turnName }),
          className: isMyTurn ? "hud-pill-active" : undefined,
        });
      }
      break;
    }

    case "exchange": {
      pills.push({ text: compact ? t("game.exchange") : t("game.phaseExchange") });
      if (compact && game.contract && game.ombre !== null) {
        const ombreName =
          game.ombre === state.mySeat
            ? t("common.you")
            : seatLabelShort(state, game.ombre, locale);
        pills.push({
          text: `${t("game.ombreRole")} · ${ombreName} · ${localizedContractDisplayLabel(
            game.contract,
            game.trump,
            locale
          )}`,
          className: "hud-pill-contract",
        });
      }
      if (compact && game.exchange.current !== null) {
        pills.push({
          text:
            game.exchange.current === state.mySeat
              ? t("common.you")
              : seatLabelShort(state, game.exchange.current, locale),
          className: game.exchange.current === state.mySeat ? "hud-pill-active" : undefined,
        });
      } else if (!compact && game.exchange.current !== null) {
        const exchName =
          game.exchange.current === state.mySeat
            ? t("common.you")
            : compact
              ? seatLabelShort(state, game.exchange.current, locale)
              : seatLabelForAnnouncements(state, game.exchange.current, locale);
        pills.push({
          text: compact ? t("game.exchanging", { name: exchName }) : t("game.exchanging", { name: exchName }),
        });
      }
      pills.push({
        text: compact
          ? t("game.talonShort", { count: game.exchange.talonSize })
          : t("game.talonRemaining", { count: game.exchange.talonSize }),
      });
      if (!compact && game.contract) {
        pills.push({
          text: localizedContractDisplayLabel(game.contract, game.trump, locale),
          className: "hud-pill-contract",
        });
      }
      break;
    }

    case "penetro_choice": {
      pills.push({ text: compact ? t("game.penetro") : t("game.phasePenetro") });
      if (compact && game.turn !== null) {
        pills.push({
          text: compactTurnText,
          className: isMyTurn ? "hud-pill-active" : undefined,
        });
      } else if (!compact && game.turn !== null) {
        pills.push({
          text: t("game.deciding", { name: turnName }),
          className: isMyTurn ? "hud-pill-active" : undefined,
        });
      }
      break;
    }

    case "dealing": {
      pills.push({
        text: compact
          ? t("game.roundShortNoTarget", { hand: game.handNo })
          : t("game.round", { hand: game.handNo, target: game.gameTarget }),
      });
      pills.push({ text: t("game.dealing") });
      break;
    }

    case "post_hand":
    case "scoring": {
      pills.push({
        text: compact
          ? t("game.roundShortNoTarget", { hand: game.handNo })
          : t("game.round", { hand: game.handNo, target: game.gameTarget }),
      });
      pills.push({ text: t("game.handComplete") });
      pills.push({ text: t("game.target", { target: game.gameTarget }) });
      break;
    }

    case "match_end": {
      pills.push({ text: t("game.matchComplete") });
      break;
    }

    default: {
      pills.push({
        text: compact
          ? t("game.roundShortNoTarget", { hand: game.handNo })
          : t("game.round", { hand: game.handNo, target: game.gameTarget }),
      });
      pills.push({ text: phaseDisplayLabel(game.phase, locale) });
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

function ExitIcon(): ReactElement {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
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

export function GameTopChrome({
  ctx,
  bridge,
}: {
  ctx: AppContext;
  bridge: GameDomLayerBridge;
}): ReactElement {
  const state = useClientState(ctx.state);
  const snapshot = useGameDomLayerSnapshot(bridge);
  const profile = useProfile(ctx.profile);
  const settings = useSettings(ctx.settings);
  const { t } = createTranslator(settings.locale);
  const { latencyMs } = useConnectionSnapshot(ctx.connection);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const headerPills = buildHudPills(state, now, snapshot.isMobilePortrait, settings.locale);
  const soundOn = settings.soundEnabled;
  const avatarSrc = profile.avatar || ctx.profile.getFallbackAvatar();
  const pingValue = latencyMs === null ? "--" : `${Math.round(latencyMs)}ms`;
  const pingLabel = t("game.ping", { value: pingValue });
  const profileMeta = profileMetaLabel(state.roomCode, settings.locale);

  return (
    <>
      <header className="game-header panel-noise rc-panel-noise">
        <div className="game-header-left">
          <button
            className="btn-ghost game-leave-btn"
            type="button"
            aria-label={t("game.backHomeAria")}
            onClick={() => {
              ctx.connection.send({ type: "LEAVE_ROOM" });
            }}
          >
            <ExitIcon />
            <span className="game-leave-btn-label">{t("game.backHome")}</span>
          </button>
          <div className="game-header-brand" aria-hidden="true">
            <img className="game-header-logo-mark" src={GAME_LOGO_SRC} alt="" />
          </div>
        </div>
        <div className="game-header-right">
          <button
            className="btn-ghost game-settings-btn"
            type="button"
            aria-label={t("game.settingsAria")}
            onClick={() => {
              openSettingsModal(ctx.settings);
            }}
          >
            <SettingsIcon />
          </button>
          <button
            className="btn-ghost game-sound-btn"
            type="button"
            aria-label={t("game.soundAria")}
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
              openProfileModal(ctx.profile, {
                locale: settings.locale,
                auth: ctx.auth,
              });
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
    </>
  );
}
