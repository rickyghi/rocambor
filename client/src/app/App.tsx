import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./../styles/theme.css";
import "./../styles/components.css";
import "./../styles/global.css";
import { SoundManager } from "../audio/sounds";
import { ConnectionManager } from "../connection";
import { ProfileManager } from "../lib/profile";
import type { AppContext, RouterHandle, ScreenName } from "../router";
import { SCREEN_NAMES } from "../router";
import { ClientState } from "../state";
import { SettingsManager } from "../ui/settings";
import { useConnectionSnapshot, useSettings } from "./hooks";
import { GameScreen } from "./screens/GameScreen";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { MatchSummaryScreen } from "./screens/MatchSummaryScreen";
import { PostHandScreen } from "./screens/PostHandScreen";

function readRouteFromHash(): ScreenName {
  const hash = window.location.hash.slice(1);
  if (SCREEN_NAMES.includes(hash as ScreenName)) {
    return hash as ScreenName;
  }
  return "home";
}

export function App(): ReactElement {
  const [services] = useState(() => {
    const settings = new SettingsManager();
    const sounds = new SoundManager(settings);
    const state = new ClientState();
    const connection = new ConnectionManager(state);
    const profile = new ProfileManager();

    return { settings, sounds, state, connection, profile };
  });
  const { settings, sounds, state, connection, profile } = services;

  const [route, setRoute] = useState<ScreenName>(() => readRouteFromHash());
  const routeRef = useRef(route);
  const connectionSnapshot = useConnectionSnapshot(connection);
  const settingsSnapshot = useSettings(settings);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    const handleHashChange = (): void => {
      setRoute(readRouteFromHash());
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "reduced-motion",
      settingsSnapshot.reduceMotion
    );
  }, [settingsSnapshot.reduceMotion]);

  useEffect(() => {
    connection.connect();
  }, [connection]);

  const navigate = useCallback((name: ScreenName): void => {
    const targetHash = `#${name}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = name;
      return;
    }
    setRoute(name);
  }, []);

  const router = useMemo<RouterHandle>(
    () => ({
      navigate,
      getCurrentScreen: () => routeRef.current,
    }),
    [navigate]
  );

  const ctx = useMemo<AppContext>(
    () => ({
      connection,
      state,
      sounds,
      settings,
      profile,
      router,
    }),
    [connection, profile, router, settings, sounds, state]
  );

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).__rocambor = { state, connection, settings, profile, router };
    }
  }, [connection, profile, router, settings, state]);

  return (
    <>
      <div
        id="connection-banner"
        style={{
          display: connectionSnapshot.connected ? "none" : "block",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          textAlign: "center",
          padding: "8px 16px",
          fontSize: "13px",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
          fontWeight: 600,
          background: "#B02E2E",
          color: "#fff",
        }}
      >
        Connection lost - reconnecting...
      </div>

      {route === "home" ? <HomeScreen ctx={ctx} /> : null}
      {route === "lobby" ? <LobbyScreen ctx={ctx} /> : null}
      {route === "leaderboard" ? <LeaderboardScreen ctx={ctx} /> : null}
      {route === "post-hand" ? <PostHandScreen ctx={ctx} /> : null}
      {route === "match-summary" ? <MatchSummaryScreen ctx={ctx} /> : null}
      {route === "game" ? <GameScreen ctx={ctx} /> : null}
    </>
  );
}
