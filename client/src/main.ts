import "./styles/global.css";
import { SettingsManager } from "./ui/settings";
import { SoundManager } from "./audio/sounds";
import { ClientState } from "./state";
import { ConnectionManager } from "./connection";
import { Router } from "./router";

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
  const sounds = new SoundManager(settings);
  const state = new ClientState();
  const connection = new ConnectionManager(state);

  // Router
  const router = new Router(app, { connection, state, sounds, settings });

  // Register screens
  router.register("home", () => new HomeScreen());
  router.register("lobby", () => new LobbyScreen());
  router.register("game", () => new GameScreen());
  router.register("post-hand", () => new PostHandScreen());
  router.register("match-summary", () => new MatchSummaryScreen());
  router.register("leaderboard", () => new LeaderboardScreen());

  // Navigate to initial screen
  const hash = window.location.hash.slice(1);
  if (hash && ["home", "lobby", "game", "leaderboard"].includes(hash)) {
    router.navigate(hash);
  } else {
    router.navigate("home");
  }

  // Connect to server
  connection.connect();

  // Expose for debugging in dev
  if (import.meta.env.DEV) {
    (window as any).__rocambor = { state, connection, settings, router };
  }
}

// Wait for DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
