import type { ReactElement } from "react";
import { useEffect, useState } from "react";
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
}: {
  bridge: GameFeedbackBridge;
}): ReactElement {
  const snapshot = useGameFeedbackSnapshot(bridge);
  const callout = resolveCallout(snapshot);

  return (
    <div
      className={`game-callout-hud${callout ? "" : " hidden"}${
        callout ? ` ${callout.tone}` : ""
      }${callout?.exiting ? " exit" : ""}`}
      aria-live="polite"
      hidden={!callout}
    >
      <div className="game-callout-kicker">{callout?.kicker ?? ""}</div>
      <div className="game-callout-text">{callout?.text ?? ""}</div>
    </div>
  );
}
