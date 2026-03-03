import { TABLE_THEMES, type TableTheme } from "../styles/design-tokens";

let textureCanvas: OffscreenCanvas | null = null;
let textureTheme: string | null = null;

function ensureTexture(w: number, h: number, theme: TableTheme): OffscreenCanvas {
  const key = `${w}x${h}:${theme}`;
  if (textureCanvas && textureTheme === key) return textureCanvas;

  textureCanvas = new OffscreenCanvas(w, h);
  textureTheme = key;
  const tCtx = textureCanvas.getContext("2d")!;
  const t = TABLE_THEMES[theme];

  // Base radial gradient felt
  const gradient = tCtx.createRadialGradient(
    w / 2, h / 2, 0,
    w / 2, h / 2, Math.max(w, h) * 0.6
  );
  gradient.addColorStop(0, t.light);
  gradient.addColorStop(0.5, t.felt);
  gradient.addColorStop(1, t.dark);
  tCtx.fillStyle = gradient;
  tCtx.fillRect(0, 0, w, h);

  // Subtle felt grain texture
  tCtx.globalAlpha = 0.025;
  const seed = 42;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      // Deterministic pseudo-random for stable texture
      const v = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
      if ((v - Math.floor(v)) > 0.5) {
        tCtx.fillStyle = "#000";
        tCtx.fillRect(x, y, 1, 1);
      }
    }
  }
  tCtx.globalAlpha = 1;

  return textureCanvas;
}

export function drawTableBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: TableTheme
): void {
  // Draw cached felt texture
  const tex = ensureTexture(width, height, theme);
  ctx.drawImage(tex, 0, 0);

  // Gold rim frame
  const margin = 12;
  const r = 16;
  ctx.save();
  ctx.strokeStyle = "rgba(200,166,81,0.25)";
  ctx.lineWidth = 2;
  roundRect(ctx, margin, margin, width - margin * 2, height - margin * 2, r);
  ctx.stroke();
  // Inner highlight
  ctx.strokeStyle = "rgba(200,166,81,0.08)";
  ctx.lineWidth = 1;
  roundRect(ctx, margin + 4, margin + 4, width - margin * 2 - 8, height - margin * 2 - 8, r - 2);
  ctx.stroke();
  ctx.restore();

  // Subtle inner border ellipse (gold tint)
  ctx.save();
  ctx.strokeStyle = "rgba(200,166,81,0.1)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2 - 20, 300, 180, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Center glow
  ctx.save();
  ctx.fillStyle = "rgba(200,166,81,0.02)";
  ctx.beginPath();
  ctx.arc(width / 2, height / 2 - 20, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawTableCards(
  ctx: CanvasRenderingContext2D,
  tableCX: number,
  tableCY: number,
  tableCards: Array<{ x: number; y: number }>,
): void {
  if (tableCards.length > 0) {
    ctx.save();
    ctx.fillStyle = "rgba(200,166,81,0.015)";
    ctx.beginPath();
    ctx.arc(tableCX, tableCY, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
