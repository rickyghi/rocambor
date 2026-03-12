import type { Card, SeatIndex } from "../../protocol";

export interface TrickDisplayOverlaySnapshot {
  cards: Card[];
  playOrder: SeatIndex[];
  winner: SeatIndex;
}

export interface GameDomLayerSnapshot {
  spriteMode: boolean;
  isMobilePortrait: boolean;
  pendingPlayCard: string | null;
  trickDisplayOverlay: TrickDisplayOverlaySnapshot | null;
  invalidShakeNonce: number;
}

interface GameDomLayerHandlers {
  onCardInteraction: (cardId: string, tapToConfirm: boolean) => void;
  onMobileAction: () => void;
  onSpriteRenderFailure: () => void;
}

type SnapshotListener = (snapshot: GameDomLayerSnapshot) => void;

function cloneOverlay(
  overlay: TrickDisplayOverlaySnapshot | null
): TrickDisplayOverlaySnapshot | null {
  if (!overlay) return null;
  return {
    cards: overlay.cards.map((card) => ({ ...card })),
    playOrder: overlay.playOrder.slice(),
    winner: overlay.winner,
  };
}

export class GameDomLayerBridge {
  private snapshot: GameDomLayerSnapshot = {
    spriteMode: false,
    isMobilePortrait: false,
    pendingPlayCard: null,
    trickDisplayOverlay: null,
    invalidShakeNonce: 0,
  };

  private listeners = new Set<SnapshotListener>();
  private handlers: GameDomLayerHandlers | null = null;

  getSnapshot(): GameDomLayerSnapshot {
    return {
      ...this.snapshot,
      trickDisplayOverlay: cloneOverlay(this.snapshot.trickDisplayOverlay),
    };
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setHandlers(handlers: GameDomLayerHandlers | null): void {
    this.handlers = handlers;
  }

  setSpriteMode(spriteMode: boolean): void {
    if (this.snapshot.spriteMode === spriteMode) return;
    this.snapshot.spriteMode = spriteMode;
    this.notify();
  }

  setIsMobilePortrait(isMobilePortrait: boolean): void {
    if (this.snapshot.isMobilePortrait === isMobilePortrait) return;
    this.snapshot.isMobilePortrait = isMobilePortrait;
    this.notify();
  }

  setPendingPlayCard(cardId: string | null): void {
    if (this.snapshot.pendingPlayCard === cardId) return;
    this.snapshot.pendingPlayCard = cardId;
    this.notify();
  }

  setTrickDisplayOverlay(overlay: TrickDisplayOverlaySnapshot | null): void {
    this.snapshot.trickDisplayOverlay = cloneOverlay(overlay);
    this.notify();
  }

  pulseInvalidShake(): void {
    this.snapshot.invalidShakeNonce += 1;
    this.notify();
  }

  interactWithCard(cardId: string, tapToConfirm: boolean): void {
    this.handlers?.onCardInteraction(cardId, tapToConfirm);
  }

  triggerMobileAction(): void {
    this.handlers?.onMobileAction();
  }

  reportSpriteRenderFailure(): void {
    this.handlers?.onSpriteRenderFailure();
  }

  reset(): void {
    this.handlers = null;
    this.snapshot = {
      spriteMode: false,
      isMobilePortrait: false,
      pendingPlayCard: null,
      trickDisplayOverlay: null,
      invalidShakeNonce: 0,
    };
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
