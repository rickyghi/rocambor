import { TABLE_THEMES, type TableTheme } from "../styles/design-tokens";

export function drawTableBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: TableTheme
): void {
  const t = TABLE_THEMES[theme];

  // Radial gradient felt
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, Math.max(width, height) * 0.6
  );
  gradient.addColorStop(0, t.light);
  gradient.addColorStop(0.5, t.felt);
  gradient.addColorStop(1, t.dark);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Subtle inner border ellipse
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2 - 20, 300, 180, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Center dot
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.03)";
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
  // This is handled by the renderer iterating over table cards
  // Just provide a highlight for the center area if cards are present
  if (tableCards.length > 0) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.beginPath();
    ctx.arc(tableCX, tableCY, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
