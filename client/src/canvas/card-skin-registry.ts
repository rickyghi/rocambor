import type { Suit } from "../protocol";

export type CardSkin = string;
export type CardBackPattern =
  | "diamond"
  | "vertical"
  | "horizontal"
  | "crosshatch"
  | "ornate";

export interface SuitPalette {
  primary: string;
  secondary: string;
}

export type SkinTheme = "classic" | "modern" | "ornate" | "custom";
export type SkinRarity = "common" | "rare" | "legendary";

export interface CardSkinDefinition {
  id: string;
  label: string;
  description: string;
  faceColor: string;
  faceBorderColor: string;
  backColor: string;
  backBorderColor: string;
  backPatternColor: string;
  backPattern: CardBackPattern;
  emblem: string;
  emblemColor: string;
  emblemFont: string;
  cornerFont: string;
  suitFont: string;
  centerFont: string;
  courtFont: string;
  selectionBorderColor: string;
  hoverBorderColor: string;
  suitOverrides?: Partial<Record<Suit, SuitPalette>>;
  suitOverridesColorblind?: Partial<Record<Suit, SuitPalette>>;
  // Image-based skin support
  imageMode?: boolean;
  imagePath?: string;
  imageExtension?: "png" | "svg" | "webp" | "jpg" | "jpeg";
  // Metadata
  author?: string;
  theme?: SkinTheme;
  rarity?: SkinRarity;
}

export interface CardSkinImportInput {
  id: string;
  label?: string;
  description?: string;
  faceColor?: string;
  faceBorderColor?: string;
  backColor?: string;
  backBorderColor?: string;
  backPatternColor?: string;
  backPattern?: CardBackPattern;
  emblem?: string;
  emblemColor?: string;
  emblemFont?: string;
  cornerFont?: string;
  suitFont?: string;
  centerFont?: string;
  courtFont?: string;
  selectionBorderColor?: string;
  hoverBorderColor?: string;
  suitOverrides?: Partial<Record<Suit, SuitPalette>>;
  suitOverridesColorblind?: Partial<Record<Suit, SuitPalette>>;
  imageExtension?: "png" | "svg" | "webp" | "jpg" | "jpeg";
}

const STORAGE_KEY = "rocambor_custom_card_skins_v1";
export const DEFAULT_BUILTIN_CARD_SKIN = "fournier_vitoria";

const SPANISH_IMAGE_SKIN_BASE = {
  faceColor: "#F8F6F0",
  faceBorderColor: "#C8A651",
  backColor: "#2A4D41",
  backBorderColor: "#C8A651",
  backPatternColor: "rgba(200,166,81,0.18)",
  backPattern: "ornate" as CardBackPattern,
  emblem: "R",
  emblemColor: "rgba(200,166,81,0.6)",
  emblemFont: '700 27px "Playfair Display", Georgia, serif',
  cornerFont: '700 14px "Inter", system-ui, sans-serif',
  suitFont: '12px "Inter", system-ui, sans-serif',
  centerFont: '700 34px "Inter", system-ui, sans-serif',
  courtFont: '700 12px "Inter", system-ui, sans-serif',
  selectionBorderColor: "#C8A651",
  hoverBorderColor: "#C8A651",
  suitOverrides: {
    oros: { primary: "#C8A651", secondary: "#8a6a24" },
    copas: { primary: "#B02E2E", secondary: "#7a1f1f" },
    espadas: { primary: "#0D0D0D", secondary: "#3f3f3f" },
    bastos: { primary: "#2A4D41", secondary: "#1f3627" },
  },
};

function createSpanishImageSkin(input: {
  id: string;
  label: string;
  description: string;
  author: string;
  imagePath: string;
  imageExtension?: CardSkinDefinition["imageExtension"];
  theme?: SkinTheme;
  rarity?: SkinRarity;
}): CardSkinDefinition {
  return {
    ...SPANISH_IMAGE_SKIN_BASE,
    ...input,
    theme: input.theme ?? "classic",
    rarity: input.rarity ?? "rare",
    imageMode: true,
    imageExtension: input.imageExtension ?? "png",
  };
}

const BUILTIN_SKINS: CardSkinDefinition[] = [
  createSpanishImageSkin({
    id: "fournier_kids",
    label: "Fournier Kids",
    description: "Playful Fournier-inspired Spanish deck artwork with classic linework",
    author: "Heraclio Fournier / local import",
    imagePath: "/cards/heraclio_fournier_vitoria",
    imageExtension: "webp",
    theme: "classic",
    rarity: "legendary",
  }),
  {
    id: "rocambor",
    label: "Fournier 8-Bit",
    description: "Ivory, gold, forest green, and deep crimson",
    author: "Rocambor",
    theme: "ornate",
    rarity: "rare",
    faceColor: "#F8F6F0",
    faceBorderColor: "#C8A651",
    backColor: "#2A4D41",
    backBorderColor: "#C8A651",
    backPatternColor: "rgba(200,166,81,0.18)",
    backPattern: "ornate",
    emblem: "R",
    emblemColor: "rgba(200,166,81,0.6)",
    emblemFont: '700 27px "Playfair Display", Georgia, serif',
    cornerFont: '700 14px "Inter", system-ui, sans-serif',
    suitFont: '12px "Inter", system-ui, sans-serif',
    centerFont: '700 34px "Inter", system-ui, sans-serif',
    courtFont: '700 12px "Inter", system-ui, sans-serif',
    selectionBorderColor: "#C8A651",
    hoverBorderColor: "#C8A651",
    suitOverrides: {
      oros: { primary: "#C8A651", secondary: "#8a6a24" },
      copas: { primary: "#B02E2E", secondary: "#7a1f1f" },
      espadas: { primary: "#0D0D0D", secondary: "#3f3f3f" },
      bastos: { primary: "#2A4D41", secondary: "#1f3627" },
    },
    suitOverridesColorblind: {
      oros: { primary: "#C8A651", secondary: "#8a6a24" },
      copas: { primary: "#2a5e90", secondary: "#214872" },
      espadas: { primary: "#2a2a2a", secondary: "#4d4d4d" },
      bastos: { primary: "#8c5a12", secondary: "#65410d" },
    },
  },
  {
    id: "parchment",
    label: "Ronda Morocco",
    description: "Traditional Spanish vector deck with ornate Moroccan-inspired artwork",
    author: "Ronda Morocco / local import",
    theme: "ornate",
    rarity: "rare",
    imageMode: true,
    imagePath: "/cards/ronda_morocco",
    imageExtension: "svg",
    faceColor: "#f4ead2",
    faceBorderColor: "#b08b5c",
    backColor: "#6b3f22",
    backBorderColor: "#f6d2a2",
    backPatternColor: "rgba(246,210,162,0.22)",
    backPattern: "horizontal",
    emblem: "R",
    emblemColor: "rgba(246,210,162,0.55)",
    emblemFont: '700 26px "Playfair Display", Georgia, serif',
    cornerFont: '700 14px "Playfair Display", Georgia, serif',
    suitFont: '12px "Playfair Display", Georgia, serif',
    centerFont: '700 34px "Playfair Display", Georgia, serif',
    courtFont: '700 12px "Playfair Display", Georgia, serif',
    selectionBorderColor: "#C8A651",
    hoverBorderColor: "#C8A651",
  },
  createSpanishImageSkin({
    id: "maestros_naiperos_espanoles",
    label: "Maestros Naiperos Españoles",
    description: "Bold Spanish deck artwork from the Maestros Naiperos Españoles set",
    author: "Maestros Naiperos Españoles / local import",
    imagePath: "/cards/maestros_naiperos_espanoles",
    imageExtension: "webp",
    theme: "ornate",
    rarity: "legendary",
  }),
  createSpanishImageSkin({
    id: "heraclio_fournier",
    label: "Heraclio Fournier",
    description: "Traditional Heraclio Fournier Spanish card artwork",
    author: "Heraclio Fournier / local import",
    imagePath: "/cards/heraclio_fournier",
    imageExtension: "webp",
    theme: "classic",
    rarity: "legendary",
  }),
  createSpanishImageSkin({
    id: "cartes_catalanes",
    label: "Cartes Catalanes",
    description: "Catalan-style Spanish deck artwork with regional character",
    author: "Cartes Catalanes / local import",
    imagePath: "/cards/cartes_catalanes",
    imageExtension: "webp",
    theme: "ornate",
    rarity: "rare",
  }),
  createSpanishImageSkin({
    id: "mazoka_baraja_espanola",
    label: "Mazoka Baraja Española",
    description: "Modern Spanish deck artwork from the Mazoka Baraja Española set",
    author: "Mazoka / local import",
    imagePath: "/cards/mazoka_baraja_espanola",
    imageExtension: "webp",
    theme: "modern",
    rarity: "rare",
  }),
  createSpanishImageSkin({
    id: "cartes_espagnoles",
    label: "Cartes Espagnoles",
    description: "Classic French-published Spanish deck artwork with elegant historic linework",
    author: "Cartes Espagnoles / local import",
    imagePath: "/cards/cartes_espagnoles",
    imageExtension: "webp",
    theme: "classic",
    rarity: "rare",
  }),
  createSpanishImageSkin({
    id: "fournier_cocina",
    label: "Fournier Cocina",
    description: "Warm kitchen-inspired Fournier Spanish deck artwork",
    author: "Fournier Cocina / local import",
    imagePath: "/cards/fournier_cocina",
    imageExtension: "webp",
    theme: "ornate",
    rarity: "rare",
  }),
  createSpanishImageSkin({
    id: "azahar",
    label: "Azahar",
    description: "Bright floral Spanish deck artwork with orange blossom character",
    author: "Azahar / local import",
    imagePath: "/cards/azahar",
    imageExtension: "webp",
    theme: "ornate",
    rarity: "legendary",
  }),
  createSpanishImageSkin({
    id: "fournier_france",
    label: "Fournier France",
    description: "French Fournier-style Spanish deck artwork with crisp court illustrations",
    author: "Fournier France / local import",
    imagePath: "/cards/fournier_france",
    imageExtension: "webp",
    theme: "classic",
    rarity: "legendary",
  }),
  createSpanishImageSkin({
    id: "fournier_vitoria",
    label: "Fournier Vitoria",
    description: "Historic Fournier Vitoria Spanish deck artwork",
    author: "Fournier Vitoria / local import",
    imagePath: "/cards/fournier_vitoria",
    imageExtension: "webp",
    theme: "classic",
    rarity: "legendary",
  }),
  createSpanishImageSkin({
    id: "baraja_virreynal",
    label: "Baraja Virreynal",
    description: "Decorative viceregal Spanish deck artwork with rich period character",
    author: "Baraja Virreynal / local import",
    imagePath: "/cards/baraja_virreynal",
    imageExtension: "webp",
    theme: "ornate",
    rarity: "legendary",
  }),
];

const BUILTIN_IDS = new Set(BUILTIN_SKINS.map((skin) => skin.id));
const BUILTIN_MAP = new Map(BUILTIN_SKINS.map((skin) => [skin.id, skin]));
const BUILTIN_ALIASES = new Map<string, string>([
  ["fournier_kids", "fournier_kids"],
  ["fournier-kids", "fournier_kids"],
  ["fournier kids", "fournier_kids"],
  ["Fournier Kids", "fournier_kids"],
  ["heraclio_fournier_vitoria", "fournier_kids"],
  ["heraclio-fournier-vitoria", "fournier_kids"],
  ["heraclio fournier vitoria", "fournier_kids"],
  ["Heraclio Fournier Vitoria", "fournier_kids"],
  ["fournier vitoria", "fournier_vitoria"],
  ["fournier-vitoria", "fournier_vitoria"],
  ["maestros naiperos espanoles", "maestros_naiperos_espanoles"],
  ["mazoka baraja espanola", "mazoka_baraja_espanola"],
  ["ronda morocco", "parchment"],
  ["ronda-morocco", "parchment"],
  ["fournier 8-bit", "rocambor"],
  ["fournier-8-bit", "rocambor"],
]);

let loaded = false;
let customSkins: CardSkinDefinition[] = [];
let customMap = new Map<string, CardSkinDefinition>();

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    customSkins = parsed
      .map((item) => sanitizeCustomSkin(item))
      .filter((item): item is CardSkinDefinition => item !== null);
    rebuildCustomMap();
  } catch {
    customSkins = [];
    customMap.clear();
  }
}

function saveCustomSkins(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customSkins));
  } catch {
    // Ignore storage write errors
  }
}

function rebuildCustomMap(): void {
  customMap = new Map(customSkins.map((skin) => [skin.id, skin]));
}

function sanitizeCustomSkin(input: unknown): CardSkinDefinition | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id.trim().toLowerCase() : "";
  if (!isValidCustomSkinId(id)) return null;
  return mergeCustomSkin({ ...(source as unknown as CardSkinImportInput), id });
}

function isValidCustomSkinId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{1,31}$/.test(id) && !BUILTIN_IDS.has(id);
}

function mergeCustomSkin(input: CardSkinImportInput): CardSkinDefinition {
  const base = BUILTIN_MAP.get("rocambor")!;
  return {
    ...base,
    ...input,
    id: input.id,
    label: input.label?.trim() || input.id,
    description: input.description?.trim() || "Custom imported skin",
    backPattern: normalizePattern(input.backPattern) || base.backPattern,
    suitOverrides: mergeSuitOverrides(base.suitOverrides, input.suitOverrides),
    suitOverridesColorblind: mergeSuitOverrides(
      base.suitOverridesColorblind,
      input.suitOverridesColorblind
    ),
  };
}

function normalizePattern(pattern: unknown): CardBackPattern | null {
  if (
    pattern === "diamond" ||
    pattern === "vertical" ||
    pattern === "horizontal" ||
    pattern === "crosshatch" ||
    pattern === "ornate"
  ) {
    return pattern;
  }
  return null;
}

function mergeSuitOverrides(
  base: Partial<Record<Suit, SuitPalette>> | undefined,
  override: Partial<Record<Suit, SuitPalette>> | undefined
): Partial<Record<Suit, SuitPalette>> | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base || {}),
    ...(override || {}),
  };
}

export function listCardSkins(): CardSkinDefinition[] {
  ensureLoaded();
  return [...BUILTIN_SKINS, ...customSkins];
}

export function getCardSkinDefinition(id: CardSkin | undefined): CardSkinDefinition {
  ensureLoaded();
  const normalizedId = typeof id === "string" ? id.trim().toLowerCase() : "";
  if (normalizedId && customMap.has(normalizedId)) return customMap.get(normalizedId)!;
  const labelMatch = normalizedId
    ? BUILTIN_SKINS.find((skin) => skin.label.toLowerCase() === normalizedId)
    : undefined;
  const canonicalId = normalizedId && (
    BUILTIN_ALIASES.get(normalizedId) ??
    labelMatch?.id ??
    normalizedId
  );
  if (canonicalId && BUILTIN_MAP.has(canonicalId)) return BUILTIN_MAP.get(canonicalId)!;
  return BUILTIN_MAP.get(DEFAULT_BUILTIN_CARD_SKIN) ?? BUILTIN_MAP.get("rocambor")!;
}

export function normalizeCardSkinId(id: CardSkin | undefined): CardSkin {
  return getCardSkinDefinition(id).id;
}

export function isCustomCardSkin(id: string): boolean {
  ensureLoaded();
  return customMap.has(id);
}

export function importCustomCardSkin(rawJson: string): CardSkinDefinition {
  ensureLoaded();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Invalid JSON format. Check for missing commas or brackets.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Skin data must be a JSON object, not an array or primitive.");
  }

  const input = parsed as CardSkinImportInput;
  const id = typeof input.id === "string" ? input.id.trim().toLowerCase() : "";
  if (!id) {
    throw new Error('Missing required "id" field. Example: {"id": "my_skin"}');
  }
  if (!isValidCustomSkinId(id)) {
    throw new Error(`Invalid skin id "${id}". Must be 2-32 chars: lowercase letters, numbers, _ or -.`);
  }

  // Validate color fields
  const colorFields = [
    "faceColor", "faceBorderColor", "backColor", "backBorderColor",
    "backPatternColor", "emblemColor", "selectionBorderColor", "hoverBorderColor",
  ] as const;
  for (const field of colorFields) {
    const val = (input as any)[field];
    if (val !== undefined && typeof val !== "string") {
      throw new Error(`Field "${field}" must be a CSS color string.`);
    }
  }

  // Validate backPattern
  const validPatterns = ["diamond", "vertical", "horizontal", "crosshatch", "ornate"];
  if ((input as any).backPattern !== undefined && !validPatterns.includes((input as any).backPattern)) {
    throw new Error(`Invalid backPattern "${(input as any).backPattern}". Must be one of: ${validPatterns.join(", ")}.`);
  }

  const merged = mergeCustomSkin({ ...input, id });
  const existingIndex = customSkins.findIndex((skin) => skin.id === id);
  if (existingIndex >= 0) {
    customSkins[existingIndex] = merged;
  } else {
    customSkins.push(merged);
  }

  rebuildCustomMap();
  saveCustomSkins();
  return merged;
}

export function removeCustomCardSkin(id: string): boolean {
  ensureLoaded();
  const next = customSkins.filter((skin) => skin.id !== id);
  if (next.length === customSkins.length) return false;
  customSkins = next;
  rebuildCustomMap();
  saveCustomSkins();
  return true;
}
