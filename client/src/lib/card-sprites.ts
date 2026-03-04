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

export function spriteAssetPaths(): { css: string; json: string; image: string } {
  return {
    css: SPRITE_CSS_PATH,
    json: SPRITE_JSON_PATH,
    image: SPRITE_IMAGE_PATH,
  };
}

async function canFetch(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function detectSpritesheetSupport(): Promise<boolean> {
  if (!spriteSupportPromise) {
    spriteSupportPromise = (async () => {
      const [cssOk, jsonOk, imageOk] = await Promise.all([
        canFetch(SPRITE_CSS_PATH),
        canFetch(SPRITE_JSON_PATH),
        canFetch(SPRITE_IMAGE_PATH),
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

export function spriteClassForCard(card: Card): string {
  const suit = SUIT_CLASS[card.s] || "oros";
  return `roc-card roc-card--${suit}-${card.r}`;
}

export function spriteBackClass(): string {
  return "roc-card roc-card--back";
}
