import { buildDiceBearUrl, fallbackAvatarAt } from "./avatars";
import {
  PLAYER_AVATAR_LEGACY_KEY,
  PLAYER_AVATAR_KEY,
  PLAYER_NAME_LEGACY_KEY,
  PLAYER_NAME_KEY,
  PROFILE_COMPLETE_KEY,
  readStorageAny,
  writeStorage,
} from "./storage";

export interface PlayerProfile {
  name: string;
  avatar: string;
}

type ProfileListener = (profile: PlayerProfile) => void;

const DEFAULT_NAME = "Player";
const NAME_PATTERN = /^[\p{L}\p{N} ]+$/u;

export function normalizeProfileName(input: string): string {
  return input.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 18);
}

export function validateProfileName(input: string): string | null {
  const value = normalizeProfileName(input);
  if (!value) return "Name is required.";
  if (value.length < 1 || value.length > 18) return "Name must be 1-18 characters.";
  if (!NAME_PATTERN.test(value)) return "Use letters (including accents), numbers, and spaces.";
  return null;
}

function fallbackAvatar(name: string): string {
  return buildDiceBearUrl(name || DEFAULT_NAME, "identicon");
}

function loadName(): string {
  const raw = readStorageAny([PLAYER_NAME_KEY, PLAYER_NAME_LEGACY_KEY]);
  const normalized = normalizeProfileName(raw || "");
  if (!normalized || validateProfileName(normalized) !== null) {
    return DEFAULT_NAME;
  }
  return normalized;
}

function loadAvatar(name: string): string {
  const raw = readStorageAny([PLAYER_AVATAR_KEY, PLAYER_AVATAR_LEGACY_KEY]);
  if (raw && raw.trim()) return raw.trim();
  return fallbackAvatar(name);
}

export class ProfileManager {
  private profile: PlayerProfile;
  private listeners = new Set<ProfileListener>();

  constructor() {
    const name = loadName();
    const avatar = loadAvatar(name);
    this.profile = { name, avatar };
    writeStorage(PLAYER_NAME_KEY, name);
    writeStorage(PLAYER_AVATAR_KEY, avatar);
  }

  get(): PlayerProfile {
    return { ...this.profile };
  }

  subscribe(fn: ProfileListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setName(input: string): string | null {
    const err = validateProfileName(input);
    if (err) return err;
    const name = normalizeProfileName(input);
    this.profile.name = name;
    writeStorage(PLAYER_NAME_KEY, name);
    this.notify();
    return null;
  }

  setAvatar(url: string): void {
    const avatar = url.trim() || fallbackAvatar(this.profile.name);
    this.profile.avatar = avatar;
    writeStorage(PLAYER_AVATAR_KEY, avatar);
    this.notify();
  }

  set(profile: PlayerProfile): string | null {
    const err = this.setName(profile.name);
    if (err) return err;
    this.setAvatar(profile.avatar);
    return null;
  }

  isComplete(): boolean {
    return readStorageAny([PROFILE_COMPLETE_KEY]) === "1";
  }

  markComplete(): void {
    writeStorage(PROFILE_COMPLETE_KEY, "1");
  }

  ensureAvatar(): string {
    if (!this.profile.avatar) {
      this.profile.avatar = fallbackAvatar(this.profile.name);
      writeStorage(PLAYER_AVATAR_KEY, this.profile.avatar);
    }
    return this.profile.avatar;
  }

  getFallbackAvatar(): string {
    const idx = Math.abs(this.profile.name.charCodeAt(0) || 0) % 12;
    return fallbackAvatarAt(idx);
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.get());
  }
}
