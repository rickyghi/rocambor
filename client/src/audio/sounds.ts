import type { SettingsManager } from "../ui/settings";

export class SoundManager {
  private ctx: AudioContext | null = null;

  constructor(private settings: SettingsManager) {}

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  private play(freq: number, duration: number, type: OscillatorType = "sine"): void {
    if (!this.settings.get("soundEnabled")) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const vol = this.settings.get("soundVolume");

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Ignore audio errors
    }
  }

  cardPlay(): void {
    this.play(800, 0.08, "square");
  }

  cardDeal(): void {
    this.play(600, 0.05, "square");
  }

  trickWin(): void {
    this.play(523, 0.15, "sine");
    setTimeout(() => this.play(659, 0.15, "sine"), 100);
    setTimeout(() => this.play(784, 0.2, "sine"), 200);
  }

  yourTurn(): void {
    this.play(440, 0.1, "triangle");
    setTimeout(() => this.play(550, 0.15, "triangle"), 120);
  }

  error(): void {
    this.play(200, 0.2, "sawtooth");
  }

  matchEnd(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => {
      setTimeout(() => this.play(n, 0.3, "sine"), i * 150);
    });
  }
}
