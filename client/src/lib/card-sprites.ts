import type { Card, Suit } from "../protocol";

const SPRITE_CSS_PATH = "/cards/rocambor_cards_spritesheet.css";
const SPRITE_JSON_PATH = "/cards/rocambor_cards_spritesheet.json";
const SPRITE_IMAGE_PATH = "/cards/rocambor_cards_spritesheet.webp";

let spriteSupportPromise: Promise<boolean> | null = null;
let cssInjected = false;

const SUIT_CLASS: Record<Suit, string> = {
  oros: "oros",
  copas: "copas",
  espadas: "espadas",
  bastos: "bastos",
};

function collectKeysDeep(value: unknown, keys: string[] = []): string[] {
  if (!value || typeof value !== "object") return keys;
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeysDeep(item, keys));
    return keys;
  }

  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    keys.push(k);
    collectKeysDeep(v, keys);
  }
  return keys;
}

export function spriteAssetPaths(): { css: string; json: string; image: string } {
  return {
    css: SPRITE_CSS_PATH,
    json: SPRITE_JSON_PATH,
    image: SPRITE_IMAGE_PATH,
  };
}

async function isValidCss(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    if (!response.ok) return false;
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/css")) return false;
    const text = await response.text();
    return text.includes(".roc-card");
  } catch {
    return false;
  }
}

async function isValidJson(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    if (!response.ok) return false;
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("json")) return false;
    const payload = await response.json();
    if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) return false;

    const keys = collectKeysDeep(payload);
    const hasSuitHint = keys.some((k) => /(oros|copas|espadas|bastos)/i.test(k));
    const hasRankHint = keys.some((k) => /(?:^|[-_])(1|2|3|4|5|6|7|10|11|12)(?:$|[-_])/i.test(k));
    return hasSuitHint || hasRankHint;
  } catch {
    return false;
  }
}

async function isValidImage(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    if (!response.ok) return false;
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    return contentType.startsWith("image/");
  } catch {
    return false;
  }
}

export async function detectSpritesheetSupport(): Promise<boolean> {
  if (!spriteSupportPromise) {
    spriteSupportPromise = (async () => {
      const [cssOk, jsonOk, imageOk] = await Promise.all([
        isValidCss(SPRITE_CSS_PATH),
        isValidJson(SPRITE_JSON_PATH),
        isValidImage(SPRITE_IMAGE_PATH),
      ]);
      return cssOk && jsonOk && imageOk;
    })();
  }
  return spriteSupportPromise;
}

export function ensureSpritesheetCss(): void {
  if (cssInjected) return;
  if (document.querySelector(`link[data-roc-spritesheet="true"]`)) {
    cssInjected = true;
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = SPRITE_CSS_PATH;
  link.dataset.rocSpritesheet = "true";
  document.head.appendChild(link);
  cssInjected = true;
}

function hasRenderableBackground(className: string): boolean {
  const probe = document.createElement("div");
  probe.className = className;
  probe.style.position = "fixed";
  probe.style.left = "-10000px";
  probe.style.top = "-10000px";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);

  const style = window.getComputedStyle(probe);
  const image = style.backgroundImage || "";
  const width = parseFloat(style.width || "0");
  const height = parseFloat(style.height || "0");
  probe.remove();

  const hasImage = image.includes("url(") && !image.includes("none");
  return hasImage && width > 0 && height > 0;
}

export function verifySpritesheetClasses(sampleCards: Card[]): boolean {
  if (!sampleCards.length) return hasRenderableBackground("roc-card roc-card--oros-1");

  const classes = sampleCards.slice(0, 3).map((card) => spriteClassForCard(card));
  classes.push("roc-card roc-card--back");
  return classes.every((className) => hasRenderableBackground(className));
}

export function spriteClassForCard(card: Card): string {
  const suit = SUIT_CLASS[card.s] || "oros";
  return `roc-card roc-card--${suit}-${card.r}`;
}

export function spriteBackClass(): string {
  return "roc-card roc-card--back";
}
