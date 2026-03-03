import type { Suit } from "../protocol";

export interface CardImageAtlas {
  get(suit: Suit, rank: number): HTMLImageElement | null;
  getBack(): HTMLImageElement | null;
  readonly loaded: boolean;
}

interface AtlasEntry {
  atlas: CardImageAtlas;
  promise: Promise<void>;
}

const atlasCache = new Map<string, AtlasEntry>();

function imageKey(suit: Suit, rank: number): string {
  return `${suit}_${rank}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

export function preloadSkinImages(
  skinId: string,
  basePath: string
): Promise<void> {
  const existing = atlasCache.get(skinId);
  if (existing) return existing.promise;

  const suits: Suit[] = ["oros", "copas", "espadas", "bastos"];
  const ranks = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

  const images = new Map<string, HTMLImageElement>();
  let backImg: HTMLImageElement | null = null;
  let isLoaded = false;

  const atlas: CardImageAtlas = {
    get(suit: Suit, rank: number): HTMLImageElement | null {
      return images.get(imageKey(suit, rank)) ?? null;
    },
    getBack(): HTMLImageElement | null {
      return backImg;
    },
    get loaded() {
      return isLoaded;
    },
  };

  const loadAll = async (): Promise<void> => {
    const tasks: Promise<void>[] = [];

    for (const suit of suits) {
      for (const rank of ranks) {
        const key = imageKey(suit, rank);
        const src = `${basePath}/${key}.png`;
        tasks.push(
          loadImage(src)
            .then((img) => { images.set(key, img); })
            .catch(() => { /* Missing card — procedural fallback */ })
        );
      }
    }

    tasks.push(
      loadImage(`${basePath}/back.png`)
        .then((img) => { backImg = img; })
        .catch(() => { /* Missing back — procedural fallback */ })
    );

    await Promise.all(tasks);
    isLoaded = true;
  };

  const promise = loadAll();
  atlasCache.set(skinId, { atlas, promise });
  return promise;
}

export function getLoadedAtlas(skinId: string): CardImageAtlas | null {
  const entry = atlasCache.get(skinId);
  return entry?.atlas.loaded ? entry.atlas : null;
}
