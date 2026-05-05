import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { AppContext } from "../../router";
import { GameScreen as GameScreenController } from "../../screens/game";
import { GameControlsBar } from "./GameControlsBar";
import { GameFeedbackOverlays } from "./GameFeedbackOverlays";
import { GameDomLayerBridge } from "./game-dom-layer-bridge";
import { GameFeedbackBridge } from "./game-feedback-bridge";
import { detectGameMobilePortrait } from "./game-viewport";
import { GameHandDock, GameTrickDomLayers, GameVolteoReveal } from "./GameDomLayers";
import {
  GameHeroPlates,
  GameOpponentsStrip,
  GameSelfHeroPlate,
} from "./GamePlayerChrome";
import { GameTopChrome } from "./GameTopChrome";
import { useClientState, useSettings } from "../hooks";
import { createTranslator } from "../../i18n";

export function GameScreen({ ctx }: { ctx: AppContext }): ReactElement | null {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const state = useClientState(ctx.state);
  const pendingRoomCode = state.roomCode;
  const game = state.game;
  const settings = useSettings(ctx.settings);
  const { t } = createTranslator(settings.locale);
  const domLayerBridgeRef = useRef(
    new GameDomLayerBridge({
      spriteMode: true,
      isMobilePortrait: detectGameMobilePortrait(),
    })
  );
  const feedbackBridgeRef = useRef(new GameFeedbackBridge());

  // Guard: navigate away when there's no game and no pending room code
  useEffect(() => {
    if (!game && !pendingRoomCode) {
      ctx.router.navigate("home");
    }
  }, [ctx.router, game, pendingRoomCode]);

  // Controller lifecycle: mount once per ctx, never torn down on game state updates
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const controller = new GameScreenController();
    controller.attach(host, ctx, domLayerBridgeRef.current, feedbackBridgeRef.current);

    return () => {
      controller.unmount();
    };
  }, [ctx]); // ctx is stable per session

  // Keep bridge isMobilePortrait in sync with orientation changes
  useEffect(() => {
    const update = (): void => {
      domLayerBridgeRef.current.setIsMobilePortrait(detectGameMobilePortrait());
    };

    const portraitMql = window.matchMedia("(orientation: portrait)");
    portraitMql.addEventListener("change", update);
    window.addEventListener("resize", update);

    return () => {
      portraitMql.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []); // run once; domLayerBridgeRef.current is stable

  // Track landscape mode for rotate prompt
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 900px) and (orientation: landscape)").matches;
  });

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 900px) and (orientation: landscape)");
    const update = (): void => setIsLandscape(mql.matches);
    mql.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mql.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!game) {
    if (!pendingRoomCode) return null;
    return (
      <div ref={hostRef} className="screen game-screen felt-shell sprite-mode">
        {isLandscape && (
          <div className="landscape-rotate-prompt" role="alertdialog" aria-modal="true" aria-label={t("game.landscape.title")}>
            <div className="landscape-rotate-prompt__icon" aria-hidden="true">⟳</div>
            <p className="landscape-rotate-prompt__title">{t("game.landscape.title")}</p>
            <p className="landscape-rotate-prompt__sub">{t("game.landscape.sub")}</p>
          </div>
        )}
        <div className="felt-background" aria-hidden="true">
          <div className="felt-base"></div>
          <div className="felt-texture"></div>
          <div className="felt-vignette"></div>
          <div className="felt-noise"></div>
          <div className="felt-ellipse"></div>
        </div>
        <div className="game-shell">
          <div className="game-screen-loading" role="status" aria-live="polite">
            <div className="game-screen-loading__orb" aria-hidden="true" />
            <div className="game-screen-loading__copy">
              <span className="game-screen-loading__kicker">{t("game.loading.kicker")}</span>
              <strong className="game-screen-loading__title">{pendingRoomCode}</strong>
              <p className="game-screen-loading__text">{t("game.loading.text")}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="screen game-screen felt-shell sprite-mode">
      {isLandscape && (
        <div className="landscape-rotate-prompt" role="alertdialog" aria-modal="true" aria-label={t("game.landscape.title")}>
          <div className="landscape-rotate-prompt__icon" aria-hidden="true">⟳</div>
          <p className="landscape-rotate-prompt__title">{t("game.landscape.title")}</p>
          <p className="landscape-rotate-prompt__sub">{t("game.landscape.sub")}</p>
        </div>
      )}
      <div className="felt-background" aria-hidden="true">
        <div className="felt-base"></div>
        <div className="felt-texture"></div>
        <div className="felt-vignette"></div>
        <div className="felt-noise"></div>
        <div className="felt-ellipse"></div>
      </div>
      <div className="game-shell">
        <GameTopChrome ctx={ctx} bridge={domLayerBridgeRef.current} />
        <GameOpponentsStrip ctx={ctx} bridge={domLayerBridgeRef.current} />
        <div className="game-stage rc-table-stage">
          <GameFeedbackOverlays bridge={feedbackBridgeRef.current} ctx={ctx} />
          <div className="game-stage-mid">
            <div className="game-canvas-wrap">
              <canvas id="game-canvas"></canvas>
            </div>
          </div>
          <GameHeroPlates ctx={ctx} />
          <GameTrickDomLayers ctx={ctx} bridge={domLayerBridgeRef.current} />
          <GameVolteoReveal ctx={ctx} bridge={domLayerBridgeRef.current} />
          <GameControlsBar ctx={ctx} />
          <div className="game-stage-bottom">
            <GameSelfHeroPlate ctx={ctx} />
            <GameHandDock ctx={ctx} bridge={domLayerBridgeRef.current} />
          </div>
        </div>
      </div>
    </div>
  );
}
