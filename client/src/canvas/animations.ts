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

// ---- Easing functions ----

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

// ---- Animation classes ----

/**
 * Card play animation: moves a card from a start position toward the table center.
 * Renders a simple translucent card-shaped ghost.
 */
export class CardPlayAnimation implements Animation {
  startTime = 0;
  duration: number;

  constructor(
    private fromX: number,
    private fromY: number,
    private toX: number,
    private toY: number,
    private cardW: number,
    private cardH: number,
    duration = 250
  ) {
    this.duration = duration;
  }

  draw(ctx: CanvasRenderingContext2D, progress: number): void {
    const t = easeOutCubic(progress);
    const x = this.fromX + (this.toX - this.fromX) * t;
    const y = this.fromY + (this.toY - this.fromY) * t;
    const alpha = 1 - progress * 0.4; // Fade slightly as it arrives
    const scale = 1 - progress * 0.15; // Shrink slightly

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Ghost card shape
    const w = this.cardW;
    const h = this.cardH;
    const r = 6;

    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    ctx.lineTo(w / 2, h / 2 - r);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    ctx.lineTo(-w / 2 + r, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    ctx.lineTo(-w / 2, -h / 2 + r);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    ctx.closePath();

    ctx.fillStyle = "rgba(248, 246, 240, 0.5)";
    ctx.fill();
    ctx.strokeStyle = "rgba(200, 166, 81, 0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Trick win animation: expanding gold ring from the table center.
 */
export class TrickWinAnimation implements Animation {
  startTime = 0;
  duration: number;

  constructor(
    private centerX: number,
    private centerY: number,
    duration = 600
  ) {
    this.duration = duration;
  }

  draw(ctx: CanvasRenderingContext2D, progress: number): void {
    const t = easeOutQuart(progress);
    const radius = 20 + t * 120;
    const alpha = 1 - progress;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Outer gold ring
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#C8A651";
    ctx.lineWidth = 3 - progress * 2;
    ctx.shadowColor = "#C8A651";
    ctx.shadowBlur = 12 * (1 - progress);
    ctx.stroke();

    // Inner shimmer
    if (progress < 0.5) {
      const innerAlpha = (1 - progress * 2) * 0.3;
      ctx.beginPath();
      ctx.arc(this.centerX, this.centerY, radius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 166, 81, ${innerAlpha})`;
      ctx.fill();
    }

    // Sparkle dots at cardinal points
    if (progress < 0.6) {
      const sparkleAlpha = (1 - progress / 0.6) * 0.8;
      ctx.shadowBlur = 0;
      ctx.globalAlpha = sparkleAlpha;
      const sparkleRadius = radius + 4;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 + progress * Math.PI * 0.5;
        const sx = this.centerX + Math.cos(angle) * sparkleRadius;
        const sy = this.centerY + Math.sin(angle) * sparkleRadius;
        const dotSize = (1 - progress / 0.6) * 3;
        ctx.beginPath();
        ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = "#C8A651";
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

/**
 * Card deal animation: staggered cards moving from center to a target position.
 * Creates a brief visual flourish during dealing.
 */
export class CardDealAnimation implements Animation {
  startTime = 0;
  duration: number;

  constructor(
    private centerX: number,
    private centerY: number,
    private targetX: number,
    private targetY: number,
    private cardW: number,
    private cardH: number,
    private delay: number,
    duration = 300
  ) {
    this.duration = duration + delay;
  }

  draw(ctx: CanvasRenderingContext2D, progress: number): void {
    // Account for delay
    const delayFrac = this.delay / this.duration;
    if (progress < delayFrac) return;

    const adjustedProgress = (progress - delayFrac) / (1 - delayFrac);
    const t = easeOutCubic(Math.min(adjustedProgress, 1));
    const x = this.centerX + (this.targetX - this.centerX) * t;
    const y = this.centerY + (this.targetY - this.centerY) * t;
    const alpha = Math.min(adjustedProgress * 3, 1) * (1 - Math.max(0, adjustedProgress - 0.7) * 3.33);

    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);

    // Small card back ghost
    const w = this.cardW * 0.7;
    const h = this.cardH * 0.7;
    const r = 4;

    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    ctx.lineTo(w / 2, h / 2 - r);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    ctx.lineTo(-w / 2 + r, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    ctx.lineTo(-w / 2, -h / 2 + r);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    ctx.closePath();

    ctx.fillStyle = "rgba(42, 77, 65, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(200, 166, 81, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Score change animation: floating number above a position.
 */
export class ScoreChangeAnimation implements Animation {
  startTime = 0;
  duration: number;

  constructor(
    private x: number,
    private y: number,
    private delta: number,
    duration = 800
  ) {
    this.duration = duration;
  }

  draw(ctx: CanvasRenderingContext2D, progress: number): void {
    const t = easeOutCubic(progress);
    const floatY = this.y - t * 40;
    const alpha = 1 - progress;

    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 18px "Inter", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const text = this.delta > 0 ? `+${this.delta}` : String(this.delta);
    const color = this.delta > 0 ? "#C8A651" : "#B02E2E";

    // Shadow
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 4;
    ctx.fillStyle = color;
    ctx.fillText(text, this.x, floatY);

    ctx.restore();
  }
}
