import { useEffect, useState, type ReactElement } from "react";
import { drawCard } from "../canvas/cards";
import { getCardSkinDefinition, type CardSkin } from "../canvas/card-skin-registry";
import type { Card } from "../protocol";
import { spriteBackClass, spriteClassForCard } from "./card-sprites";

const DOM_CARD_RENDER_WIDTH = 192;
const DOM_CARD_RENDER_HEIGHT = 276;

const proceduralCache = new Map<string, string>();

function proceduralCacheKey(
  skinId: CardSkin | undefined,
  card: Card | null,
  colorblind: boolean,
  faceDown: boolean
): string {
  if (faceDown || !card) {
    return `${skinId || "rocambor"}|back|${colorblind ? "cb" : "std"}`;
  }
  return `${skinId || "rocambor"}|${card.s}|${card.r}|${colorblind ? "cb" : "std"}`;
}

function proceduralCardDataUrl(
  skinId: CardSkin | undefined,
  card: Card | null,
  colorblind: boolean,
  faceDown: boolean
): string {
  const key = proceduralCacheKey(skinId, card, colorblind, faceDown);
  const cached = proceduralCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = DOM_CARD_RENDER_WIDTH;
  canvas.height = DOM_CARD_RENDER_HEIGHT;
  const ctx = canvas.getContext("2d");

  if (!ctx) return "";

  drawCard(
    ctx,
    DOM_CARD_RENDER_WIDTH / 2,
    DOM_CARD_RENDER_HEIGHT / 2,
    DOM_CARD_RENDER_WIDTH - 4,
    DOM_CARD_RENDER_HEIGHT - 4,
    faceDown ? null : card,
    colorblind,
    {
      faceDown,
      skin: skinId,
    }
  );

  const dataUrl = canvas.toDataURL("image/png");
  proceduralCache.set(key, dataUrl);
  return dataUrl;
}

function imageCardSrc(skinId: CardSkin | undefined, card: Card | null, faceDown: boolean): string | null {
  const skin = getCardSkinDefinition(skinId);
  if (!skin.imageMode || !skin.imagePath) return null;
  const ext = skin.imageExtension || "png";
  const fileName = faceDown || !card ? "back" : `${card.s}_${card.r}`;
  return `${skin.imagePath}/${fileName}.${ext}`;
}

export function skinUsesRocamborSprites(skinId: CardSkin | undefined): boolean {
  return getCardSkinDefinition(skinId).id === "rocambor";
}

export function DomCardArt({
  card,
  skinId,
  colorblind = false,
  faceDown = false,
}: {
  card: Card | null;
  skinId: CardSkin | undefined;
  colorblind?: boolean;
  faceDown?: boolean;
}): ReactElement {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const imageSrc = imageCardSrc(skinId, card, faceDown);

  useEffect(() => {
    setImageFailed(false);
    setImageReady(false);
  }, [imageSrc]);

  if (skinUsesRocamborSprites(skinId)) {
    const className = faceDown || !card ? spriteBackClass() : spriteClassForCard(card);
    return (
      <div
        className={`game-dom-card ${className}`}
        data-dom-card-kind="sprite"
        aria-hidden="true"
      />
    );
  }

  if (imageSrc && !imageFailed) {
    const fallbackSrc = proceduralCardDataUrl(skinId, card, colorblind, faceDown);
    return (
      <span
        className="game-dom-card game-dom-card--image"
        data-dom-card-kind="image"
        aria-hidden="true"
        style={{ backgroundImage: `url("${fallbackSrc}")` }}
      >
        <img
          className="game-dom-card-image-el"
          src={imageSrc}
          alt=""
          draggable={false}
          aria-hidden="true"
          style={{ opacity: imageReady ? 1 : 0 }}
          onLoad={() => setImageReady(true)}
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  const generatedSrc = proceduralCardDataUrl(skinId, card, colorblind, faceDown);
  return (
    <img
      className="game-dom-card game-dom-card--generated"
      data-dom-card-kind="generated"
      src={generatedSrc}
      alt=""
      draggable={false}
      aria-hidden="true"
    />
  );
}
