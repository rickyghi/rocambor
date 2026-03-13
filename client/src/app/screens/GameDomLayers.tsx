import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useRef } from "react";
import { createTranslator, positionLabel } from "../../i18n";
import { DomCardArt, skinUsesRocamborSprites } from "../../lib/dom-card-art";
import type { SeatIndex } from "../../protocol";
import type { AppContext } from "../../router";
import type { ClientState } from "../../state";
import { useClientState, useSettings } from "../hooks";
import type { GameDomLayerBridge, GameDomLayerSnapshot } from "./game-dom-layer-bridge";
import { useGameDomLayerSnapshot } from "./useGameDomLayerSnapshot";

type VarStyle = CSSProperties & Record<string, string>;

function detectTouchConfirm(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none)").matches;
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

function trickActorLabel(state: ClientState, seat: number | undefined, locale: "en" | "es"): string {
  if (seat === undefined) return "";
  const rel = state.relativePosition(seat as SeatIndex);
  if (rel === "self") return locale === "es" ? "TÚ" : "YOU";
  const game = state.game;
  let relLabel = positionLabel(rel, locale).toUpperCase();
  if (game?.ombre !== null && game?.ombre !== undefined) {
    if (seat === game.ombre) {
      relLabel = locale === "es" ? "JUGADOR" : "PLAYER";
    } else {
      const primer = nextActiveSeat(state, game.ombre);
      const segundo = nextActiveSeat(state, primer);
      if (seat === primer) relLabel = locale === "es" ? "PRIMER" : "FIRST";
      else if (seat === segundo) relLabel = locale === "es" ? "SEGUNDO" : "SECOND";
    }
  }
  const handle = state.game?.players[seat]?.handle;
  return handle ? `${relLabel} · ${handle}` : relLabel;
}

function trickSlotStyle(
  position: "self" | "left" | "across" | "right",
  isMobilePortrait: boolean
): VarStyle {
  const map = isMobilePortrait
    ? {
        left: { x: "-112px", y: "24px", r: "-7deg" },
        across: { x: "0px", y: "-88px", r: "0deg" },
        right: { x: "112px", y: "24px", r: "7deg" },
        self: { x: "0px", y: "72px", r: "0deg" },
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
  snapshot: GameDomLayerSnapshot,
  locale: "en" | "es"
): MobileActionState {
  const { t } = createTranslator(locale);
  if (!snapshot.isMobilePortrait) {
    return { hidden: true, disabled: true, label: t("game.selectCard"), ready: false };
  }

  const game = state.game;
  if (!game) {
    return { hidden: true, disabled: true, label: t("game.selectCard"), ready: false };
  }

  if (state.phase === "play" && state.isMyTurn) {
    if (snapshot.pendingPlayCard) {
      return {
        hidden: false,
        disabled: false,
        label: t("game.playCard"),
        ready: true,
      };
    }
    return {
      hidden: true,
      disabled: true,
      label: t("game.selectCard"),
      ready: false,
    };
  }

  if (state.phase === "exchange" && state.canExchangeNow) {
    return {
      hidden: true,
      disabled: true,
      label: t("game.exchange.trade"),
      ready: false,
    };
  }

  return { hidden: true, disabled: true, label: t("game.selectCard"), ready: false };
}

export function GameTrickDomLayers({
  ctx,
  bridge,
}: {
  ctx: AppContext;
  bridge: GameDomLayerBridge;
}): ReactElement {
  const state = useClientState(ctx.state);
  const settings = useSettings(ctx.settings);
  const snapshot = useGameDomLayerSnapshot(bridge);
  const { t } = createTranslator(settings.locale);
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
                {isWinner ? <div className="trick-winner-badge">{t("game.winner")}</div> : null}
                <DomCardArt
                  card={card}
                  skinId={settings.cardSkin}
                  colorblind={settings.colorblindMode}
                />
                {seat !== undefined ? (
                  <div className="trick-card-label">{trickActorLabel(state, seat, settings.locale)}</div>
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
  const settings = useSettings(ctx.settings);
  const snapshot = useGameDomLayerSnapshot(bridge);
  const handLayerRef = useRef<HTMLDivElement | null>(null);
  const dragSuppressUntilRef = useRef(0);
  const dragStateRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startScrollLeft: 0,
    dragging: false,
  });
  const touchConfirm = detectTouchConfirm();
  const handSignature = state.hand.map((card) => card.id).join("|");
  const { t } = createTranslator(settings.locale);
  const action = mobileActionState(state, snapshot, settings.locale);
  const usesSpriteSheet = skinUsesRocamborSprites(settings.cardSkin);

  useEffect(() => {
    if (!snapshot.spriteMode || state.hand.length === 0 || !usesSpriteSheet) return;

    const timeoutId = window.setTimeout(() => {
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
    }, 140);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    bridge,
    handSignature,
    snapshot.spriteMode,
    snapshot.isMobilePortrait,
    state.hand.length,
    usesSpriteSheet,
  ]);

  useEffect(() => {
    const row = handLayerRef.current;
    if (!row || !snapshot.isMobilePortrait) return;

    const drag = dragStateRef.current;

    const beginDrag = (clientX: number): void => {
      drag.startX = clientX;
      drag.startScrollLeft = row.scrollLeft;
      drag.dragging = false;
    };

    const updateDrag = (clientX: number): boolean => {
      const delta = clientX - drag.startX;
      if (!drag.dragging && Math.abs(delta) > 6) {
        drag.dragging = true;
        row.classList.add("dragging");
      }
      if (!drag.dragging) return false;
      row.scrollLeft = drag.startScrollLeft - delta;
      return true;
    };

    const finishDrag = (pointerId: number): void => {
      if (drag.pointerId !== pointerId) return;
      if (drag.dragging) {
        dragSuppressUntilRef.current = Date.now() + 220;
      }
      drag.pointerId = null;
      drag.dragging = false;
      row.classList.remove("dragging");
      try {
        if (row.hasPointerCapture(pointerId)) {
          row.releasePointerCapture(pointerId);
        }
      } catch {
        // Some browsers can reject pointer capture release after a cancel.
      }
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (row.scrollWidth <= row.clientWidth + 4) return;
      if (event.pointerType === "touch") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      drag.pointerId = event.pointerId;
      beginDrag(event.clientX);
      try {
        row.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is a progressive enhancement for smoother drag scrolling.
      }
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (drag.pointerId !== event.pointerId) return;
      if (updateDrag(event.clientX)) {
        event.preventDefault();
      }
    };

    const handlePointerUp = (event: PointerEvent): void => {
      finishDrag(event.pointerId);
    };

    const handlePointerCancel = (event: PointerEvent): void => {
      finishDrag(event.pointerId);
    };

    row.addEventListener("pointerdown", handlePointerDown);
    row.addEventListener("pointermove", handlePointerMove);
    row.addEventListener("pointerup", handlePointerUp);
    row.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      row.removeEventListener("pointerdown", handlePointerDown);
      row.removeEventListener("pointermove", handlePointerMove);
      row.removeEventListener("pointerup", handlePointerUp);
      row.removeEventListener("pointercancel", handlePointerCancel);
      row.classList.remove("dragging");
      drag.pointerId = null;
      drag.dragging = false;
    };
  }, [snapshot.isMobilePortrait, handSignature]);

  const game = state.game;
  const legalIds = game?.legalIds || [];
  const handleHandKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();

    const row = e.currentTarget;
    const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>("button.hand-card-wrap:not([disabled])"));
    if (buttons.length === 0) return;

    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);

    let nextIndex: number;
    if (e.key === "ArrowLeft") {
      nextIndex = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
    } else {
      nextIndex = currentIndex >= buttons.length - 1 ? 0 : currentIndex + 1;
    }

    buttons[nextIndex]?.focus();
  }, []);

  const showHandDock = snapshot.spriteMode && state.hand.length > 0;

  return (
    <div className="game-hand-dock" id="game-hand-dock" aria-label={t("game.yourHandArea")} hidden={!showHandDock}>
      <div className="hand-dock-header" aria-hidden="true">
        <span className="hand-dock-title">
          {snapshot.isMobilePortrait ? t("game.yourHandSwipe") : t("game.yourHand")}
        </span>
        {snapshot.isMobilePortrait ? null : (
          <span className="hand-dock-hint">{t("game.swipe")}</span>
        )}
      </div>
      <div
        key={snapshot.invalidShakeNonce}
        ref={handLayerRef}
        className={`hand-row${snapshot.invalidShakeNonce > 0 ? " invalid-shake" : ""}`}
        id="hand-layer"
        role="listbox"
        aria-label="Your hand"
        onKeyDown={handleHandKeyDown}
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
                if (Date.now() < dragSuppressUntilRef.current) return;
                bridge.interactWithCard(card.id, touchConfirm);
              }}
            >
              <DomCardArt
                card={card}
                skinId={settings.cardSkin}
                colorblind={settings.colorblindMode}
              />
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
