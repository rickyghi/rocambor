import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { createTranslator } from "../../i18n";
import type { AppContext } from "../../router";
import { useSettings } from "../hooks";
import type {
  ArenaToastSnapshot,
  GameFeedbackBridge,
  GameFeedbackSnapshot,
} from "./game-feedback-bridge";

function useGameFeedbackSnapshot(bridge: GameFeedbackBridge): GameFeedbackSnapshot {
  const [snapshot, setSnapshot] = useState(() => bridge.getSnapshot());

  useEffect(() => bridge.subscribe(setSnapshot), [bridge]);

  return snapshot;
}

function stripTurnPrefix(text: string): string {
  return text.replace(/^Your turn:\s*/i, "").trim();
}

function latestToast(snapshot: GameFeedbackSnapshot): ArenaToastSnapshot | null {
  if (snapshot.toasts.length === 0) return null;
  return snapshot.toasts[snapshot.toasts.length - 1] ?? null;
}

function resolveCallout(snapshot: GameFeedbackSnapshot): {
  kicker: string;
  text: string;
  tone: "neutral" | "your-turn" | "result" | "toast";
  exiting: boolean;
} | null {
  const banner = snapshot.phaseBanner;
  const trickResult = snapshot.trickResult;
  const toast = latestToast(snapshot);

  if (trickResult) {
    return {
      kicker: "Trick Result",
      text: trickResult.text,
      tone: "result",
      exiting: trickResult.exiting,
    };
  }

  if (banner.yourTurn) {
    return {
      kicker: "Your Turn",
      text: stripTurnPrefix(banner.sub) || banner.main,
      tone: "your-turn",
      exiting: false,
    };
  }

  if (toast) {
    return {
      kicker: banner.main || "Update",
      text: toast.text,
      tone: "toast",
      exiting: toast.exiting,
    };
  }

  if (!banner.main && !banner.sub) return null;

  return {
    kicker: banner.main || "Update",
    text: banner.sub || banner.main,
    tone: "neutral",
    exiting: false,
  };
}

export function GameFeedbackOverlays({
  bridge,
  ctx,
}: {
  bridge: GameFeedbackBridge;
  ctx: AppContext;
}): ReactElement {
  const settings = useSettings(ctx.settings);
  const { t } = createTranslator(settings.locale);
  const snapshot = useGameFeedbackSnapshot(bridge);
  const callout = resolveCallout(snapshot);
  const localizedCallout =
    callout === null
      ? null
      : {
          ...callout,
          kicker:
            callout.tone === "result"
              ? t("game.kicker.trickResult")
              : callout.tone === "your-turn"
                ? t("game.kicker.yourTurn")
                : callout.kicker === "Update"
                  ? t("game.kicker.update")
                  : callout.kicker,
        };

  return (
    <div
      className={`game-callout-hud${localizedCallout ? "" : " hidden"}${
        localizedCallout ? ` ${localizedCallout.tone}` : ""
      }${localizedCallout?.exiting ? " exit" : ""}`}
      aria-live="polite"
      hidden={!localizedCallout}
    >
      <div className="game-callout-kicker">{localizedCallout?.kicker ?? ""}</div>
      <div className="game-callout-text">{localizedCallout?.text ?? ""}</div>
    </div>
  );
}
