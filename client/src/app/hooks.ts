import { useEffect, useState } from "react";
import type { ConnectionManager } from "../connection";
import type { AuthManager, AuthSnapshot } from "../auth/supabase-auth";
import type { PlayerProfile, ProfileManager } from "../lib/profile";
import type { ClientState } from "../state";
import type { Settings, SettingsManager } from "../ui/settings";

export interface ConnectionSnapshot {
  connected: boolean;
  latencyMs: number | null;
}

export function useClientState(state: ClientState): ClientState {
  const [, setVersion] = useState(0);

  useEffect(() => state.subscribe(() => setVersion((value) => value + 1)), [state]);

  return state;
}

export function useConnectionSnapshot(connection: ConnectionManager): ConnectionSnapshot {
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>({
    connected: connection.connected,
    latencyMs: connection.latencyMs,
  });

  useEffect(() => {
    const refresh = (): void => {
      setSnapshot({
        connected: connection.connected,
        latencyMs: connection.latencyMs,
      });
    };

    const unsubscribes = [
      connection.on("_connected", refresh as never),
      connection.on("_disconnected", refresh as never),
      connection.on("_latency", refresh as never),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [connection]);

  return snapshot;
}

export function useProfile(profile: ProfileManager): PlayerProfile {
  const [snapshot, setSnapshot] = useState(() => profile.get());

  useEffect(() => profile.subscribe(setSnapshot), [profile]);

  return snapshot;
}

export function useAuthSnapshot(auth: AuthManager): AuthSnapshot {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(() => auth.getSnapshot());

  useEffect(() => auth.subscribe(setSnapshot), [auth]);

  return snapshot;
}

export function useSettings(settings: SettingsManager): Readonly<Settings> {
  const [snapshot, setSnapshot] = useState<Readonly<Settings>>(settings.getAll());

  useEffect(
    () => settings.subscribe((next) => setSnapshot({ ...next })),
    [settings]
  );

  return snapshot;
}
