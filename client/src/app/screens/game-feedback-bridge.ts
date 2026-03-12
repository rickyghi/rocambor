export interface GamePhaseBannerSnapshot {
  main: string;
  sub: string;
  yourTurn: boolean;
}

export interface ArenaToastSnapshot {
  id: number;
  text: string;
  exiting: boolean;
}

export interface TrickResultSnapshot {
  text: string;
  exiting: boolean;
}

export interface GameFeedbackSnapshot {
  phaseBanner: GamePhaseBannerSnapshot;
  toasts: ArenaToastSnapshot[];
  trickResult: TrickResultSnapshot | null;
}

type SnapshotListener = (snapshot: GameFeedbackSnapshot) => void;

function cloneSnapshot(snapshot: GameFeedbackSnapshot): GameFeedbackSnapshot {
  return {
    phaseBanner: { ...snapshot.phaseBanner },
    toasts: snapshot.toasts.map((toast) => ({ ...toast })),
    trickResult: snapshot.trickResult ? { ...snapshot.trickResult } : null,
  };
}

export class GameFeedbackBridge {
  private snapshot: GameFeedbackSnapshot = {
    phaseBanner: {
      main: "",
      sub: "",
      yourTurn: false,
    },
    toasts: [],
    trickResult: null,
  };

  private listeners = new Set<SnapshotListener>();
  private nextToastId = 1;
  private toastTimers = new Map<number, { exitTimer: number; removeTimer: number }>();
  private trickExitTimer: number | null = null;
  private trickHideTimer: number | null = null;

  getSnapshot(): GameFeedbackSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setPhaseBanner(banner: GamePhaseBannerSnapshot): void {
    this.snapshot.phaseBanner = { ...banner };
    this.notify();
  }

  setPhaseBannerSub(sub: string): void {
    if (this.snapshot.phaseBanner.sub === sub) return;
    this.snapshot.phaseBanner = {
      ...this.snapshot.phaseBanner,
      sub,
    };
    this.notify();
  }

  pushToast(text: string, ttlMs = 1400): void {
    if (this.snapshot.toasts.length >= 2) {
      const survivors = this.snapshot.toasts.slice(-1);
      const dropped = this.snapshot.toasts.slice(0, -1);
      dropped.forEach((toast) => this.clearToastTimers(toast.id));
      this.snapshot.toasts = survivors;
    }

    const id = this.nextToastId++;
    this.snapshot.toasts = [...this.snapshot.toasts, { id, text, exiting: false }];
    this.notify();

    const exitTimer = window.setTimeout(() => {
      this.snapshot.toasts = this.snapshot.toasts.map((toast) =>
        toast.id === id ? { ...toast, exiting: true } : toast
      );
      this.notify();
    }, ttlMs);

    const removeTimer = window.setTimeout(() => {
      this.snapshot.toasts = this.snapshot.toasts.filter((toast) => toast.id !== id);
      this.clearToastTimers(id);
      this.notify();
    }, ttlMs + 260);

    this.toastTimers.set(id, { exitTimer, removeTimer });
  }

  showTrickResult(text: string): void {
    this.clearTrickTimers();
    this.snapshot.trickResult = { text, exiting: false };
    this.notify();

    this.trickExitTimer = window.setTimeout(() => {
      if (!this.snapshot.trickResult) return;
      this.snapshot.trickResult = {
        ...this.snapshot.trickResult,
        exiting: true,
      };
      this.notify();

      this.trickHideTimer = window.setTimeout(() => {
        this.snapshot.trickResult = null;
        this.trickHideTimer = null;
        this.notify();
      }, 300);

      this.trickExitTimer = null;
    }, 1400);
  }

  reset(): void {
    this.toastTimers.forEach((_, id) => this.clearToastTimers(id));
    this.clearTrickTimers();
    this.snapshot = {
      phaseBanner: {
        main: "",
        sub: "",
        yourTurn: false,
      },
      toasts: [],
      trickResult: null,
    };
    this.notify();
  }

  private clearToastTimers(id: number): void {
    const timers = this.toastTimers.get(id);
    if (!timers) return;
    clearTimeout(timers.exitTimer);
    clearTimeout(timers.removeTimer);
    this.toastTimers.delete(id);
  }

  private clearTrickTimers(): void {
    if (this.trickExitTimer !== null) {
      clearTimeout(this.trickExitTimer);
      this.trickExitTimer = null;
    }
    if (this.trickHideTimer !== null) {
      clearTimeout(this.trickHideTimer);
      this.trickHideTimer = null;
    }
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
