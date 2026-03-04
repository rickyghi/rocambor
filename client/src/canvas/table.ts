import { TABLE_THEMES, type TableTheme } from "../styles/design-tokens";

type TextureCanvas = OffscreenCanvas | HTMLCanvasElement;

let textureCanvas: TextureCanvas | null = null;
let textureTheme: string | null = null;
let feltImage: HTMLImageElement | null = null;
let feltReady = false;
let watermarkImage: HTMLImageElement | null = null;
let watermarkReady = false;

function invalidateTextureCache(): void {
  textureCanvas = null;
  textureTheme = null;
}

function ensureAssetsLoaded(): void {
  if (!feltImage) {
    feltImage = new Image();
    feltImage.onload = () => {
      feltReady = true;
      invalidateTextureCache();
    };
    feltImage.onerror = () => {
      if (feltImage && !feltImage.src.endsWith("/assets/rocambor/felt-texture.jpg")) {
        feltImage.src = "/assets/rocambor/felt-texture.jpg";
        return;
      }
      if (feltImage && !feltImage.src.endsWith("/textures/felt.png")) {
        feltImage.src = "/textures/felt.png";
        return;
      }
      feltReady = false;
    };
    feltImage.src = "/assets/rocambor/felt-texture.png";
  }

  if (!watermarkImage) {
    watermarkImage = new Image();
    watermarkImage.onload = () => {
      watermarkReady = true;
    };
    watermarkImage.onerror = () => {
      if (watermarkImage && !watermarkImage.src.endsWith("/brand/rocambor-watermark.svg")) {
        watermarkImage.src = "/brand/rocambor-watermark.svg";
        return;
      }
      watermarkReady = false;
    };
    watermarkImage.src = "/assets/rocambor/rocambor-watermark.svg";
  }
}

function createTextureCanvas(w: number, h: number): TextureCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function getTextureContext2D(
  canvas: TextureCanvas
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D context unavailable for texture canvas.");
  }
  return ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

function ensureTexture(w: number, h: number, theme: TableTheme): TextureCanvas {
  ensureAssetsLoaded();
  const key = `${w}x${h}:${theme}`;
  if (textureCanvas && textureTheme === key) return textureCanvas;

  textureCanvas = createTextureCanvas(w, h);
  textureTheme = key;
  const tCtx = getTextureContext2D(textureCanvas);
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

  if (feltReady && feltImage) {
    tCtx.save();
    tCtx.globalAlpha = 0.22;
    const pattern = tCtx.createPattern(feltImage, "repeat");
    if (pattern) {
      tCtx.fillStyle = pattern;
      tCtx.fillRect(0, 0, w, h);
    }
    tCtx.restore();
  } else {
    // Fallback grain while texture image is still loading.
    tCtx.globalAlpha = 0.025;
    const seed = 42;
    for (let y = 0; y < h; y += 3) {
      for (let x = 0; x < w; x += 3) {
        const v = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
        if ((v - Math.floor(v)) > 0.5) {
          tCtx.fillStyle = "#000";
          tCtx.fillRect(x, y, 1, 1);
        }
      }
    }
    tCtx.globalAlpha = 1;
  }

  // Edge vignette for table depth/readability.
  const vignette = tCtx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.2,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.62
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.45)");
  tCtx.fillStyle = vignette;
  tCtx.fillRect(0, 0, w, h);

  return textureCanvas;
}

export function drawTableBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: TableTheme
): void {
  ensureAssetsLoaded();
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

  // Center-table watermark logo (subtle, unobtrusive).
  ctx.save();
  if (watermarkReady && watermarkImage) {
    const targetW = width > 760 ? Math.min(560, width * 0.52) : Math.min(360, width * 0.62);
    const ratio = watermarkImage.width > 0 ? watermarkImage.height / watermarkImage.width : 0.3;
    const targetH = targetW * ratio;
    const x = width / 2 - targetW / 2;
    const y = height / 2 - targetH / 2 - 14;
    ctx.globalAlpha = 0.08;
    ctx.filter = "blur(0.8px)";
    ctx.drawImage(watermarkImage, x, y, targetW, targetH);
    ctx.filter = "none";
  } else {
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "rgba(200,166,81,0.6)";
    ctx.font = `700 ${width > 760 ? 70 : 42}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ROCAMBOR", width / 2, height / 2 - 14);
  }
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
