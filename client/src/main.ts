import "./styles/theme.css";
import "./styles/components.css";
import "./styles/global.css";
import { SettingsManager } from "./ui/settings";
import { SoundManager } from "./audio/sounds";
import { ClientState } from "./state";
import { ConnectionManager } from "./connection";
import { Router } from "./router";
import { ProfileManager } from "./lib/profile";

// Screens
import { HomeScreen } from "./screens/home";
import { LobbyScreen } from "./screens/lobby";
import { GameScreen } from "./screens/game";
import { PostHandScreen } from "./screens/post-hand";
import { MatchSummaryScreen } from "./screens/match-summary";
import { LeaderboardScreen } from "./screens/leaderboard";

function bootstrap(): void {
  const app = document.getElementById("app");
  if (!app) {
    console.error("[main] #app element not found");
    return;
  }

  // Core services
  const settings = new SettingsManager();
  const syncMotionPreference = (): void => {
    document.documentElement.classList.toggle("reduced-motion", settings.get("reduceMotion"));
  };
  syncMotionPreference();
  settings.subscribe(syncMotionPreference);

  const sounds = new SoundManager(settings);
  const state = new ClientState();
  const connection = new ConnectionManager(state);
  const profile = new ProfileManager();

  // Router
  const router = new Router(app, { connection, state, sounds, settings, profile });

  // Register screens
  router.register("home", () => new HomeScreen());
  router.register("lobby", () => new LobbyScreen());
  router.register("game", () => new GameScreen());
  router.register("post-hand", () => new PostHandScreen());
  router.register("match-summary", () => new MatchSummaryScreen());
  router.register("leaderboard", () => new LeaderboardScreen());

  // Navigate to initial screen
  // Game-requiring screens (lobby, game, post-hand, match-summary) can't
  // survive a cold load because state won't exist. On reconnect the server
  // pushes ROOM_JOINED → STATE which navigates automatically.
  const hash = window.location.hash.slice(1);
  if (hash === "leaderboard") {
    router.navigate("leaderboard");
  } else {
    router.navigate("home");
  }

  // Connect to server
  connection.connect();

  // Connection state banner
  const banner = document.createElement("div");
  banner.id = "connection-banner";
  banner.style.cssText =
    "display:none;position:fixed;top:0;left:0;right:0;z-index:9999;" +
    "text-align:center;padding:8px 16px;font-size:13px;" +
    "font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-weight:600;" +
    "background:#B02E2E;color:#fff;";
  banner.textContent = "Connection lost — reconnecting\u2026";
  document.body.appendChild(banner);
  connection.on("_disconnected", () => { banner.style.display = "block"; });
  connection.on("_connected", () => { banner.style.display = "none"; });

  // Expose for debugging in dev
  if (import.meta.env.DEV) {
    (window as any).__rocambor = { state, connection, settings, profile, router };
  }
}

// Wait for DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
