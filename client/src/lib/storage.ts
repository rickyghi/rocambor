export const PLAYER_NAME_KEY = "rocambor.playerName";
export const PLAYER_AVATAR_KEY = "rocambor.playerAvatar";
export const PLAYER_NAME_LEGACY_KEY = "rocambor_name";
export const PLAYER_AVATAR_LEGACY_KEY = "rocambor_avatar";
export const PROFILE_COMPLETE_KEY = "rocambor.profileComplete";
export const PROFILE_CREATED_AT_KEY = "rocambor.profileCreatedAt";
export const PROFILE_MATCH_HISTORY_KEY = "rocambor.profileMatchHistory";

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readStorageAny(keys: string[]): string | null {
  for (const key of keys) {
    const value = readStorage(key);
    if (value !== null) return value;
  }
  return null;
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write errors.
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage write errors.
  }
}
