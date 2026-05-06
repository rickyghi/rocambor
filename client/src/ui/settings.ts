import type { TableTheme } from "../styles/design-tokens";
import type { Locale } from "../i18n";
import { DEFAULT_BUILTIN_CARD_SKIN, getCardSkinDefinition, normalizeCardSkinId } from "../canvas/card-skin-registry";

export interface Settings {
  locale: Locale;
  soundEnabled: boolean;
  espadaObligatoria: boolean;
  soundVolume: number;
  colorblindMode: boolean;
  tableTheme: TableTheme;
  cardSkin: string;
  animationSpeed: "slow" | "normal" | "fast";
  reduceMotion: boolean;
}

const STORAGE_KEY = "rocambor_settings";
const DEFAULT_CARD_SKIN = DEFAULT_BUILTIN_CARD_SKIN;

const DEFAULTS: Settings = {
  locale: "es",
  soundEnabled: true,
  espadaObligatoria: true,
  soundVolume: 0.7,
  colorblindMode: false,
  tableTheme: "classic",
  cardSkin: DEFAULT_CARD_SKIN,
  animationSpeed: "normal",
  reduceMotion: false,
};

type SettingsListener = (s: Settings) => void;

export class SettingsManager {
  private settings: Settings;
  private listeners = new Set<SettingsListener>();

  constructor() {
    this.settings = this.loadFromStorage();
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.settings[key];
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings[key] = value;
    this.saveToStorage();
    this.notify();
  }

  getAll(): Readonly<Settings> {
    return { ...this.settings };
  }

  hydrate(next: Partial<Settings>): void {
    this.settings = { ...this.settings, ...next };
    this.settings.cardSkin = this.normalizeCardSkin(this.settings.cardSkin);
    this.saveToStorage();
    this.notify();
  }

  subscribe(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private loadFromStorage(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        const merged = { ...DEFAULTS, ...parsed };
        if (merged.locale !== "en" && merged.locale !== "es") {
          merged.locale = DEFAULTS.locale;
        }
        merged.cardSkin = this.normalizeCardSkin(merged.cardSkin);
        if (typeof merged.reduceMotion !== "boolean") {
          merged.reduceMotion = DEFAULTS.reduceMotion;
        }
        if (typeof merged.espadaObligatoria !== "boolean") {
          merged.espadaObligatoria = DEFAULTS.espadaObligatoria;
        }
        return merged;
      }
    } catch {
      // Ignore parse errors
    }
    return { ...DEFAULTS };
  }

  private normalizeCardSkin(cardSkin: unknown): string {
    if (typeof cardSkin !== "string" || !cardSkin.trim()) {
      return DEFAULT_CARD_SKIN;
    }
    const trimmed = cardSkin.trim();
    if (
      trimmed === "clasica" ||
      trimmed === "spanish_deck" ||
      trimmed === "classic" ||
      trimmed === "minimal" ||
      trimmed === "heraclio_fournier_vitoria"
    ) {
      // Migrate removed or old-default deck ids to the new default.
      return DEFAULT_CARD_SKIN;
    }
    const normalized = normalizeCardSkinId(trimmed);
    const skin = getCardSkinDefinition(normalized);
    return skin.id;
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage errors
    }
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.settings);
  }
}
