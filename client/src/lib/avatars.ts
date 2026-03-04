export type DiceBearStyle =
  | "identicon"
  | "bottts-neutral"
  | "pixel-art-neutral"
  | "shapes"
  | "thumbs"
  | "adventurer-neutral";

export interface AvatarPreset {
  id: string;
  seed: string;
  style: DiceBearStyle;
  url: string;
  fallback: string;
}

const STYLES: DiceBearStyle[] = [
  "identicon",
  "bottts-neutral",
  "pixel-art-neutral",
  "shapes",
  "thumbs",
  "adventurer-neutral",
];

const FALLBACKS = Array.from({ length: 12 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return `/avatars/avatar-${n}.svg`;
});

export function buildDiceBearUrl(seed: string, style: DiceBearStyle = "identicon"): string {
  const safeSeed = encodeURIComponent(seed.trim() || "rocambor");
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${safeSeed}`;
}

export function fallbackAvatarAt(index: number): string {
  return FALLBACKS[((index % FALLBACKS.length) + FALLBACKS.length) % FALLBACKS.length];
}

export function randomAvatarSeed(): string {
  return `seed-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildInitialsAvatarDataUrl(name: string): string {
  const normalized = name.trim();
  const initials = (normalized || "Player")
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  const colors = ["#2A4D41", "#B02E2E", "#8A6A24", "#1F3A32", "#315A4A"];
  const hueIndex = Math.abs((normalized.charCodeAt(0) || 0) + (normalized.length * 7)) % colors.length;
  const bg = colors[hueIndex];

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>` +
    `<rect width='128' height='128' rx='64' fill='${bg}' />` +
    `<text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' fill='#F8F6F0' font-family='system-ui,Segoe UI,Arial' font-size='52' font-weight='700'>${initials}</text>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function createAvatarPresets(baseSeed: string): AvatarPreset[] {
  const root = baseSeed.trim() || "rocambor";
  return Array.from({ length: 12 }, (_, i) => {
    const style = STYLES[i % STYLES.length];
    const seed = `${root}-${i + 1}`;
    return {
      id: `preset-${i + 1}`,
      seed,
      style,
      url: buildDiceBearUrl(seed, style),
      fallback: fallbackAvatarAt(i),
    };
  });
}
