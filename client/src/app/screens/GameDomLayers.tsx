import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { spriteClassForCard } from "../../lib/card-sprites";
import type { Card, SeatIndex } from "../../protocol";
import type { AppContext } from "../../router";
import type { ClientState } from "../../state";
import { useClientState } from "../hooks";
import type { GameDomLayerBridge, GameDomLayerSnapshot } from "./game-dom-layer-bridge";

type VarStyle = CSSProperties & Record<string, string>;

function useGameDomLayerSnapshot(bridge: GameDomLayerBridge): GameDomLayerSnapshot {
  const [snapshot, setSnapshot] = useState(() => bridge.getSnapshot());

  useEffect(() => bridge.subscribe(setSnapshot), [bridge]);

  return snapshot;
}

function detectTouchConfirm(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none)").matches;
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

function trickActorLabel(state: ClientState, seat: number | undefined): string {
  if (seat === undefined) return "";
  const rel = state.relativePosition(seat as SeatIndex);
  if (rel === "self") return "YOU";
  const role = roleLabelForSeat(state, seat as SeatIndex);
  const relLabel =
    role === "JUGADOR"
      ? "JUGADOR"
      : role.startsWith("PRIMER")
        ? "PRIMER"
        : role.startsWith("SEGUNDO")
          ? "SEGUNDO"
          : rel.toUpperCase();
  const handle = state.game?.players[seat]?.handle;
  return handle ? `${relLabel} · ${handle}` : relLabel;
}

function capSuit(suit: string): string {
  return suit.charAt(0).toUpperCase() + suit.slice(1);
}

function cardLabel(card: Card): string {
  const rankNames: Record<number, string> = {
    1: "As",
    10: "Sota",
    11: "Caballo",
    12: "Rey",
  };
  const rank = rankNames[card.r] || String(card.r);
  return `${rank} de ${capSuit(card.s)}`;
}

function trickSlotStyle(
  position: "self" | "left" | "across" | "right",
  isMobilePortrait: boolean
): VarStyle {
  const map = isMobilePortrait
    ? {
        left: { x: "-104px", y: "18px", r: "-7deg" },
        across: { x: "0px", y: "-82px", r: "0deg" },
        right: { x: "104px", y: "18px", r: "7deg" },
        self: { x: "0px", y: "104px", r: "0deg" },
      }
    : {
        left: { x: "-214px", y: "18px", r: "-10deg" },
        across: { x: "0px", y: "-90px", r: "0deg" },
        right: { x: "214px", y: "18px", r: "10deg" },
        self: { x: "0px", y: "110px", r: "0deg" },
      };
  const slot = map[position];
  return {
    "--slot-x": slot.x,
    "--slot-y": slot.y,
    "--slot-rot": slot.r,
  };
}

function handFanStyle(index: number, count: number, isMobilePortrait: boolean): VarStyle | undefined {
  if (isMobilePortrait) return undefined;
  const mid = (count - 1) / 2;
  const delta = index - mid;
  const spread = Math.min(22, 120 / Math.max(4, count));
  const rotate = delta * spread * 0.52;
  const x = delta * 3.2;
  const y = Math.abs(delta) * 2.2;
  return {
    "--fan-rot": `${rotate.toFixed(2)}deg`,
    "--fan-x": `${x.toFixed(2)}px`,
    "--fan-y": `${y.toFixed(2)}px`,
  };
}

interface MobileActionState {
  hidden: boolean;
  disabled: boolean;
  label: string;
  ready: boolean;
}

function mobileActionState(
  state: ClientState,
  snapshot: GameDomLayerSnapshot
): MobileActionState {
  if (!snapshot.isMobilePortrait) {
    return { hidden: true, disabled: true, label: "Select a Card", ready: false };
  }

  const game = state.game;
  if (!game) {
    return { hidden: true, disabled: true, label: "Select a Card", ready: false };
  }

  if (state.phase === "play" && state.isMyTurn) {
    if (snapshot.pendingPlayCard) {
      const card = state.hand.find((item) => item.id === snapshot.pendingPlayCard);
      return {
        hidden: false,
        disabled: false,
        label: `Play ${card ? cardLabel(card) : "Selected Card"}`,
        ready: true,
      };
    }
    return {
      hidden: false,
      disabled: true,
      label: "Tap a Card to Select",
      ready: false,
    };
  }

  if (state.phase === "exchange" && state.canExchangeNow) {
    const count = state.selectedCards.size;
    const { min, max } = state.getExchangeLimits();
    const requireExactOne = min === 1 && max === 1;
    if (count > 0) {
      return {
        hidden: false,
        disabled: requireExactOne ? count !== 1 : count < min || count > max,
        label: `Exchange ${count} Card${count > 1 ? "s" : ""}`,
        ready: true,
      };
    }
    return {
      hidden: false,
      disabled: min > 0,
      label: requireExactOne ? "Select 1 Card to Exchange" : "Keep All Cards",
      ready: false,
    };
  }

  return { hidden: true, disabled: true, label: "Select a Card", ready: false };
}

export function GameTrickDomLayers({
  ctx,
  bridge,
}: {
  ctx: AppContext;
  bridge: GameDomLayerBridge;
}): ReactElement {
  const state = useClientState(ctx.state);
  const snapshot = useGameDomLayerSnapshot(bridge);
  const game = state.game;
  const trickCards = game?.table.length
    ? game.table
    : snapshot.trickDisplayOverlay?.cards ?? [];
  const trickOrder = game?.table.length
    ? game.playOrder
    : snapshot.trickDisplayOverlay?.playOrder ?? [];
  const trickWinner = game?.table.length
    ? null
    : snapshot.trickDisplayOverlay?.winner ?? null;

  return (
    <div id="game-dom-layers" className="game-dom-layers" hidden={!snapshot.spriteMode}>
      <div className="trick-overlay" aria-hidden="true">
        <div className="trick-overlay-inner" id="trick-layer">
          {trickCards.map((card, index) => {
            const seat = trickOrder[index];
            const rel = seat === undefined ? "across" : state.relativePosition(seat);
            const isWinner = trickWinner !== null && seat === trickWinner;
            return (
              <div
                key={`${card.id}-${index}`}
                className={`trick-card-wrap${isWinner ? " winner" : ""}`}
                style={trickSlotStyle(rel, snapshot.isMobilePortrait)}
              >
                {isWinner ? <div className="trick-winner-badge">WINNER</div> : null}
                <div className={spriteClassForCard(card)}></div>
                {seat !== undefined ? (
                  <div className="trick-card-label">{trickActorLabel(state, seat)}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GameHandDock({
  ctx,
  bridge,
}: {
  ctx: AppContext;
  bridge: GameDomLayerBridge;
}): ReactElement {
  const state = useClientState(ctx.state);
  const snapshot = useGameDomLayerSnapshot(bridge);
  const handLayerRef = useRef<HTMLDivElement | null>(null);
  const touchConfirm = detectTouchConfirm();
  const handSignature = state.hand.map((card) => card.id).join("|");
  const action = mobileActionState(state, snapshot);

  useEffect(() => {
    if (!snapshot.spriteMode || state.hand.length === 0) return;

    const frameId = window.requestAnimationFrame(() => {
      const nodes = handLayerRef.current?.querySelectorAll<HTMLElement>(".roc-card") ?? [];
      if (!nodes.length) {
        bridge.reportSpriteRenderFailure();
        return;
      }

      const sample = Array.from(nodes).slice(0, 3);
      const renderable = sample.every((node) => {
        const style = window.getComputedStyle(node);
        const bg = style.backgroundImage || "";
        const width = parseFloat(style.width || "0");
        const height = parseFloat(style.height || "0");
        return bg.includes("url(") && !bg.includes("none") && width > 0 && height > 0;
      });

      if (!renderable) {
        bridge.reportSpriteRenderFailure();
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [bridge, handSignature, snapshot.spriteMode, snapshot.isMobilePortrait, state.hand.length]);

  const game = state.game;
  const legalIds = game?.legalIds || [];
  const showHandDock = snapshot.spriteMode && state.hand.length > 0;

  return (
    <div className="game-hand-dock" id="game-hand-dock" aria-label="Your hand area" hidden={!showHandDock}>
      <div
        key={snapshot.invalidShakeNonce}
        ref={handLayerRef}
        className={`hand-row${snapshot.invalidShakeNonce > 0 ? " invalid-shake" : ""}`}
        id="hand-layer"
        role="listbox"
        aria-label="Your hand"
      >
        {state.hand.map((card, index) => {
          const selected = state.selectedCards.has(card.id);
          const isPlay = state.phase === "play" && state.isMyTurn;
          const illegal = isPlay && legalIds.length > 0 && !legalIds.includes(card.id);
          const legal = isPlay && !illegal;
          const pending = touchConfirm && snapshot.pendingPlayCard === card.id;

          return (
            <button
              key={card.id}
              className={`hand-card-wrap${selected ? " selected" : ""}${illegal ? " illegal" : ""}${legal ? " legal" : ""}${pending ? " pending" : ""}`}
              type="button"
              role="option"
              aria-selected={selected}
              data-card-id={card.id}
              style={handFanStyle(index, state.hand.length, snapshot.isMobilePortrait)}
              disabled={illegal}
              onClick={() => {
                bridge.interactWithCard(card.id, touchConfirm);
              }}
            >
              <div className={spriteClassForCard(card)}></div>
            </button>
          );
        })}
      </div>
      <button
        className={`hand-action-btn btn-gold-plaque${action.ready ? " ready" : ""}`}
        id="hand-action-btn"
        type="button"
        hidden={action.hidden}
        disabled={action.disabled}
        onClick={() => {
          bridge.triggerMobileAction();
        }}
      >
        {action.label}
      </button>
    </div>
  );
}
