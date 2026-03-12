import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import type { AppContext } from "../../router";
import { GameScreen as GameScreenController } from "../../screens/game";
import { GameControlsBar } from "./GameControlsBar";
import { GameFeedbackOverlays } from "./GameFeedbackOverlays";
import { GameDomLayerBridge } from "./game-dom-layer-bridge";
import { GameFeedbackBridge } from "./game-feedback-bridge";
import { detectGameMobilePortrait } from "./game-viewport";
import { GameHandDock, GameTrickDomLayers } from "./GameDomLayers";
import {
  GameHeroPlates,
  GameOpponentsStrip,
  GameSelfHeroPlate,
} from "./GamePlayerChrome";
import { GameTopChrome } from "./GameTopChrome";

export function GameScreen({ ctx }: { ctx: AppContext }): ReactElement | null {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const domLayerBridgeRef = useRef(
    new GameDomLayerBridge({
      spriteMode: true,
      isMobilePortrait: detectGameMobilePortrait(),
    })
  );
  const feedbackBridgeRef = useRef(new GameFeedbackBridge());

  useEffect(() => {
    if (!ctx.state.game) {
      ctx.router.navigate("home");
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    const controller = new GameScreenController();
    controller.attach(host, ctx, domLayerBridgeRef.current, feedbackBridgeRef.current);

    return () => {
      controller.unmount();
    };
  }, [ctx]);

  if (!ctx.state.game) return null;

  return (
    <div ref={hostRef} className="screen game-screen felt-shell sprite-mode">
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
