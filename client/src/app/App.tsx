import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./../styles/theme.css";
import "./../styles/components.css";
import "./../styles/global.css";
import { SoundManager } from "../audio/sounds";
import { AuthManager } from "../auth/supabase-auth";
import { ConnectionManager } from "../connection";
import type { MeResponse } from "../protocol";
import { detectSpritesheetSupport, ensureSpritesheetCss } from "../lib/card-sprites";
import {
  fetchCurrentAccount,
  fetchCurrentMatchHistory,
  fetchCurrentWallet,
  patchCurrentAccount,
} from "../lib/account-api";
import { saveAccountWallet } from "../lib/account-wallet-cache";
import { saveAccountProfileMatchHistory } from "../lib/profile-history";
import { ProfileManager } from "../lib/profile";
import type { AppContext, RouterHandle, ScreenName } from "../router";
import { SCREEN_NAMES } from "../router";
import { ClientState } from "../state";
import { SettingsManager } from "../ui/settings";
import { createTranslator } from "../i18n";
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

function applyRemoteAccount(
  profile: ProfileManager,
  settings: SettingsManager,
  me: MeResponse
): void {
  profile.hydrate(
    {
      name: me.name,
      avatar: me.avatar,
      createdAt: me.createdAt,
      markComplete: true,
    },
    me.settings.locale
  );
  settings.hydrate({
    locale: me.settings.locale,
    soundEnabled: me.settings.soundEnabled,
    espadaObligatoria: me.settings.espadaObligatoria,
    soundVolume: me.settings.soundVolume,
    colorblindMode: me.settings.colorblindMode,
    tableTheme: me.settings.tableTheme,
    cardSkin: me.settings.cardSkin,
    animationSpeed: me.settings.animationSpeed,
    reduceMotion: me.settings.reduceMotion,
  });
}

export function App(): ReactElement {
  const [services] = useState(() => {
    const auth = new AuthManager();
    const settings = new SettingsManager();
    const sounds = new SoundManager(settings);
    const state = new ClientState();
    const connection = new ConnectionManager(state, auth);
    const profile = new ProfileManager();

    return { auth, settings, sounds, state, connection, profile };
  });
  const { auth, settings, sounds, state, connection, profile } = services;

  const [route, setRoute] = useState<ScreenName>(() => readRouteFromHash());
  const [accountMeta, setAccountMeta] = useState<{
    userId: string;
    playerId: string;
  } | null>(null);
  const routeRef = useRef(route);
  const accountSyncRef = useRef<{
    hydrating: boolean;
    ready: boolean;
    saveTimer: number | null;
  }>({
    hydrating: false,
    ready: false,
    saveTimer: null,
  });
  const connectionSnapshot = useConnectionSnapshot(connection);
  const settingsSnapshot = useSettings(settings);
  const { t } = createTranslator(settingsSnapshot.locale);

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
    document.documentElement.lang = settingsSnapshot.locale;
  }, [settingsSnapshot.locale, settingsSnapshot.reduceMotion]);

  useEffect(() => {
    connection.connect();
  }, [connection]);

  useEffect(() => {
    ensureSpritesheetCss();
    void detectSpritesheetSupport();
  }, []);

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
      auth,
      state,
      sounds,
      settings,
      profile,
      router,
    }),
    [auth, connection, profile, router, settings, sounds, state]
  );

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).__rocambor = { state, connection, settings, profile, router, auth };
    }
  }, [auth, connection, profile, router, settings, state]);

  useEffect(() => {
    let cancelled = false;
    const syncState = accountSyncRef.current;

    const loadAccount = async (): Promise<void> => {
      const userId = auth.getUserId();
      if (!userId) {
        setAccountMeta(null);
        syncState.ready = false;
        if (syncState.saveTimer !== null) {
          window.clearTimeout(syncState.saveTimer);
          syncState.saveTimer = null;
        }
        return;
      }

      try {
        let me = await fetchCurrentAccount(auth);
        if (!me || cancelled || auth.getUserId() !== userId) return;

        if (me.bootstrapSuggested) {
          const bootstrapped = await patchCurrentAccount(auth, {
            name: profile.get().name,
            avatar: profile.get().avatar,
            settings: settings.getAll(),
          });
          if (bootstrapped) {
            me = bootstrapped;
          }
        }

        if (cancelled || auth.getUserId() !== userId) return;

        syncState.hydrating = true;
        applyRemoteAccount(profile, settings, me);
        syncState.hydrating = false;
        syncState.ready = true;
        setAccountMeta({ userId, playerId: me.playerId });

        const history = await fetchCurrentMatchHistory(auth).catch((error) => {
          console.error("[account] Failed to load account match history:", error);
          return null;
        });
        if (!cancelled && auth.getUserId() === userId && history) {
          saveAccountProfileMatchHistory(userId, history.matches);
        }

        const wallet = await fetchCurrentWallet(auth).catch((error) => {
          console.error("[account] Failed to load account wallet:", error);
          return null;
        });
        if (!cancelled && auth.getUserId() === userId) {
          saveAccountWallet(userId, wallet);
        }
      } catch (error) {
        setAccountMeta(null);
        syncState.hydrating = false;
        syncState.ready = false;
        console.error("[account] Failed to load account profile:", error);
      }
    };

    const unsubscribe = auth.subscribe(() => {
      void loadAccount();
    });

    void loadAccount();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [auth, profile, settings]);

  useEffect(() => {
    if (!accountMeta) return;

    let cancelled = false;
    let refreshPlayerTimer: number | null = null;
    let refreshWalletTimer: number | null = null;
    let refreshHistoryTimer: number | null = null;

    const schedule = (
      pendingTimer: number | null,
      assign: (value: number | null) => void,
      task: () => Promise<void>
    ): void => {
      if (pendingTimer !== null) {
        window.clearTimeout(pendingTimer);
      }
      assign(
        window.setTimeout(() => {
          assign(null);
          if (cancelled || auth.getUserId() !== accountMeta.userId) return;
          void task();
        }, 180)
      );
    };

    const refreshAccount = async (): Promise<void> => {
      const me = await fetchCurrentAccount(auth).catch((error) => {
        console.error("[account] Failed to refresh realtime profile:", error);
        return null;
      });
      if (!me || cancelled || auth.getUserId() !== accountMeta.userId) return;

      accountSyncRef.current.hydrating = true;
      applyRemoteAccount(profile, settings, me);
      accountSyncRef.current.hydrating = false;
      setAccountMeta((current) => {
        if (
          current &&
          current.userId === accountMeta.userId &&
          current.playerId === me.playerId
        ) {
          return current;
        }
        return { userId: accountMeta.userId, playerId: me.playerId };
      });
    };

    const refreshWallet = async (): Promise<void> => {
      const wallet = await fetchCurrentWallet(auth).catch((error) => {
        console.error("[account] Failed to refresh realtime wallet:", error);
        return null;
      });
      if (cancelled || auth.getUserId() !== accountMeta.userId) return;
      saveAccountWallet(accountMeta.userId, wallet);
    };

    const refreshHistory = async (): Promise<void> => {
      const history = await fetchCurrentMatchHistory(auth).catch((error) => {
        console.error("[account] Failed to refresh realtime match history:", error);
        return null;
      });
      if (!history || cancelled || auth.getUserId() !== accountMeta.userId) return;
      saveAccountProfileMatchHistory(accountMeta.userId, history.matches);
    };

    const unsubscribe = auth.subscribeToAccountRealtime(accountMeta.playerId, {
      onPlayerChanged: () => {
        schedule(refreshPlayerTimer, (value) => {
          refreshPlayerTimer = value;
        }, refreshAccount);
        schedule(refreshWalletTimer, (value) => {
          refreshWalletTimer = value;
        }, refreshWallet);
      },
      onWalletChanged: () => {
        schedule(refreshWalletTimer, (value) => {
          refreshWalletTimer = value;
        }, refreshWallet);
      },
      onMatchHistoryChanged: () => {
        schedule(refreshHistoryTimer, (value) => {
          refreshHistoryTimer = value;
        }, refreshHistory);
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (refreshPlayerTimer !== null) {
        window.clearTimeout(refreshPlayerTimer);
      }
      if (refreshWalletTimer !== null) {
        window.clearTimeout(refreshWalletTimer);
      }
      if (refreshHistoryTimer !== null) {
        window.clearTimeout(refreshHistoryTimer);
      }
    };
  }, [accountMeta, auth, profile, settings]);

  useEffect(() => {
    const syncState = accountSyncRef.current;

    const scheduleSave = (): void => {
      if (!auth.getUserId() || !syncState.ready || syncState.hydrating) {
        return;
      }

      if (syncState.saveTimer !== null) {
        window.clearTimeout(syncState.saveTimer);
      }

      syncState.saveTimer = window.setTimeout(() => {
        syncState.saveTimer = null;
        if (!auth.getUserId() || !syncState.ready || syncState.hydrating) {
          return;
        }

        void (async () => {
          try {
            const me = await patchCurrentAccount(auth, {
              name: profile.get().name,
              avatar: profile.get().avatar,
              settings: settings.getAll(),
            });
            if (!me) return;

            syncState.hydrating = true;
            applyRemoteAccount(profile, settings, me);
            syncState.hydrating = false;
          } catch (error) {
            syncState.hydrating = false;
            console.error("[account] Failed to save account profile:", error);
          }
        })();
      }, 300);
    };

    const unsubscribes = [
      profile.subscribe(() => {
        scheduleSave();
      }),
      settings.subscribe(() => {
        scheduleSave();
      }),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      if (syncState.saveTimer !== null) {
        window.clearTimeout(syncState.saveTimer);
        syncState.saveTimer = null;
      }
    };
  }, [auth, profile, settings]);

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
        {t("app.connectionLost")}
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
