import type { ConnectionManager } from "./connection";
import type { ClientState } from "./state";
import type { SoundManager } from "./audio/sounds";
import type { SettingsManager } from "./ui/settings";
import type { ProfileManager } from "./lib/profile";
import type { AuthManager } from "./auth/supabase-auth";

export const SCREEN_NAMES = [
  "home",
  "lobby",
  "game",
  "post-hand",
  "match-summary",
  "leaderboard",
] as const;

export type ScreenName = (typeof SCREEN_NAMES)[number];

export interface RouterHandle {
  navigate(name: ScreenName, params?: Record<string, string>): void;
  getCurrentScreen(): ScreenName | null;
}

export interface AppContext {
  auth: AuthManager;
  connection: ConnectionManager;
  state: ClientState;
  sounds: SoundManager;
  settings: SettingsManager;
  profile: ProfileManager;
  router: RouterHandle;
}
