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

const LOCAL_AVATAR_COUNT = 112;
const PICKER_COUNT = 12;
const PICKER_STEP = 17;
const FALLBACKS = Array.from({ length: PICKER_COUNT }, (_, i) => localAvatarAt(i));

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function localAvatarAt(index: number): string {
  const idx = mod(index, LOCAL_AVATAR_COUNT) + 1;
  return `/avatars/portraits/avatar-${String(idx).padStart(3, "0")}.png`;
}

export function avatarFromSeed(seed: string): string {
  const safeSeed = seed.trim() || "rocambor";
  return localAvatarAt(hashSeed(safeSeed));
}

export function buildDiceBearUrl(seed: string, style: DiceBearStyle = "identicon"): string {
  const safeSeed = encodeURIComponent(seed.trim() || "rocambor");
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${safeSeed}`;
}

export function buildBotAvatarUrl(
  handle: string,
  seat: number,
  roomCode?: string | null
): string {
  const safeHandle = (handle || "bot").trim().toLowerCase();
  const safeRoom = (roomCode || "room").trim().toLowerCase();
  const seed = `${safeRoom}-seat-${seat}-${safeHandle}`;
  return buildDiceBearUrl(seed, "bottts-neutral");
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
  const start = mod(hashSeed(root), LOCAL_AVATAR_COUNT);
  return Array.from({ length: PICKER_COUNT }, (_, i) => {
    const localIndex = mod(start + i * PICKER_STEP, LOCAL_AVATAR_COUNT);
    const seed = `${root}-${localIndex + 1}`;
    const url = localAvatarAt(localIndex);
    return {
      id: `preset-${i + 1}`,
      seed,
      style: "identicon",
      url,
      fallback: url,
    };
  });
}
