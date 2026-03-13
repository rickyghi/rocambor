import { avatarFromSeed, fallbackAvatarAt } from "./avatars";
import type { Locale } from "../i18n";
import {
  PLAYER_AVATAR_LEGACY_KEY,
  PLAYER_AVATAR_KEY,
  PROFILE_CREATED_AT_KEY,
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

export interface ProfileHydration {
  name?: string;
  avatar?: string;
  createdAt?: string;
  markComplete?: boolean;
}

type ProfileListener = (profile: PlayerProfile) => void;

const DEFAULT_NAME = "Player";
const NAME_PATTERN = /^[\p{L}\p{N} ]+$/u;

export function normalizeProfileName(input: string): string {
  return input.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 18);
}

export function validateProfileName(input: string, locale: Locale = "en"): string | null {
  const value = normalizeProfileName(input);
  if (!value) return locale === "es" ? "El nombre es obligatorio." : "Name is required.";
  if (value.length < 1 || value.length > 18) {
    return locale === "es"
      ? "El nombre debe tener entre 1 y 18 caracteres."
      : "Name must be 1-18 characters.";
  }
  if (!NAME_PATTERN.test(value)) {
    return locale === "es"
      ? "Usa letras (incluyendo acentos), números y espacios."
      : "Use letters (including accents), numbers, and spaces.";
  }
  return null;
}

function fallbackAvatar(name: string): string {
  return avatarFromSeed(name || DEFAULT_NAME);
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
  if (raw && raw.trim()) {
    const avatar = raw.trim();
    if (/api\.dicebear\.com/i.test(avatar)) {
      return fallbackAvatar(name);
    }
    return avatar;
  }
  return fallbackAvatar(name);
}

export class ProfileManager {
  private profile: PlayerProfile;
  private createdAt: string;
  private listeners = new Set<ProfileListener>();

  constructor() {
    const name = loadName();
    const avatar = loadAvatar(name);
    const createdAt = readStorageAny([PROFILE_CREATED_AT_KEY]) || new Date().toISOString();
    this.profile = { name, avatar };
    this.createdAt = createdAt;
    writeStorage(PLAYER_NAME_KEY, name);
    writeStorage(PLAYER_AVATAR_KEY, avatar);
    writeStorage(PROFILE_CREATED_AT_KEY, createdAt);
  }

  get(): PlayerProfile {
    return { ...this.profile };
  }

  getCreatedAt(): string {
    return this.createdAt;
  }

  subscribe(fn: ProfileListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setName(input: string, locale: Locale = "en"): string | null {
    const err = validateProfileName(input, locale);
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

  set(profile: PlayerProfile, locale: Locale = "en"): string | null {
    const err = this.setName(profile.name, locale);
    if (err) return err;
    this.setAvatar(profile.avatar);
    return null;
  }

  hydrate(next: ProfileHydration, locale: Locale = "en"): string | null {
    if (typeof next.name === "string") {
      const err = validateProfileName(next.name, locale);
      if (err) return err;
      this.profile.name = normalizeProfileName(next.name);
      writeStorage(PLAYER_NAME_KEY, this.profile.name);
    }

    if (typeof next.avatar === "string") {
      this.profile.avatar = next.avatar.trim() || fallbackAvatar(this.profile.name);
      writeStorage(PLAYER_AVATAR_KEY, this.profile.avatar);
    }

    if (typeof next.createdAt === "string" && next.createdAt.trim()) {
      this.createdAt = next.createdAt;
      writeStorage(PROFILE_CREATED_AT_KEY, this.createdAt);
    }

    if (next.markComplete) {
      this.markComplete();
    }

    this.notify();
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
