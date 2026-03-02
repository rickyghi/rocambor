export interface Animation {
  startTime: number;
  duration: number;
  draw(ctx: CanvasRenderingContext2D, progress: number): void;
}

export class AnimationManager {
  private active: Animation[] = [];

  add(anim: Animation): void {
    anim.startTime = performance.now();
    this.active.push(anim);
  }

  hasActive(): boolean {
    return this.active.length > 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    this.active = this.active.filter((a) => {
      const elapsed = now - a.startTime;
      const progress = Math.min(elapsed / a.duration, 1);
      a.draw(ctx, progress);
      return progress < 1;
    });
  }

  clear(): void {
    this.active = [];
  }
}

// Easing functions
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
