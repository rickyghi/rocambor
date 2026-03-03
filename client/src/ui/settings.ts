import type { TableTheme } from "../styles/design-tokens";

export interface Settings {
  soundEnabled: boolean;
  soundVolume: number;
  colorblindMode: boolean;
  tableTheme: TableTheme;
  cardSkin: string;
  animationSpeed: "slow" | "normal" | "fast";
}

const STORAGE_KEY = "rocambor_settings";

const DEFAULTS: Settings = {
  soundEnabled: true,
  soundVolume: 0.7,
  colorblindMode: false,
  tableTheme: "classic",
  cardSkin: "rocambor",
  animationSpeed: "normal",
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
        if (typeof merged.cardSkin !== "string" || !merged.cardSkin.trim()) {
          merged.cardSkin = DEFAULTS.cardSkin;
        }
        return merged;
      }
    } catch {
      // Ignore parse errors
    }
    return { ...DEFAULTS };
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
