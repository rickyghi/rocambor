import { useEffect, useState } from "react";
import type { GameDomLayerBridge, GameDomLayerSnapshot } from "./game-dom-layer-bridge";

export function useGameDomLayerSnapshot(
  bridge: GameDomLayerBridge
): GameDomLayerSnapshot {
  const [snapshot, setSnapshot] = useState(() => bridge.getSnapshot());

  useEffect(() => bridge.subscribe(setSnapshot), [bridge]);

  return snapshot;
}
