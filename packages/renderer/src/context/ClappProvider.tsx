import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { ClappClient, StatePoller } from "@clapps/transport";
import type { ClappState } from "@clapps/core";
import { setByPath } from "@clapps/core";

interface ClappStoreState {
  state: Record<string, unknown>;
  version: number;
  loading: boolean;
  applyState: (clappState: ClappState) => void;
}

function createClappStore() {
  return createStore<ClappStoreState>((set) => ({
    state: {},
    version: -1,
    loading: true,
    applyState: (clappState: ClappState) =>
      set({
        state: clappState.state,
        version: clappState.version,
        loading: false,
      }),
  }));
}

interface ClappContextValue {
  store: StoreApi<ClappStoreState>;
  client: ClappClient;
}

const ClappContext = createContext<ClappContextValue | null>(null);

export interface ClappProviderProps {
  relayUrl: string;
  clappId: string;
  agentId: string;
  sessionToken?: string;
  children: ReactNode;
  pollInterval?: number;
}

export function ClappProvider({
  relayUrl,
  clappId,
  agentId,
  sessionToken,
  children,
  pollInterval = 1500,
}: ClappProviderProps) {
  const storeRef = useRef<StoreApi<ClappStoreState>>(undefined);
  const clientRef = useRef<ClappClient>(undefined);

  if (!storeRef.current) {
    storeRef.current = createClappStore();
  }
  if (!clientRef.current) {
    clientRef.current = new ClappClient({ relayUrl, clappId, agentId, sessionToken });
  }

  useEffect(() => {
    const store = storeRef.current!;
    const client = clientRef.current!;

    const poller = new StatePoller(client, {
      intervalMs: pollInterval,
      onState: (s) => store.getState().applyState(s),
    });
    poller.start();
    return () => poller.stop();
  }, [relayUrl, clappId, agentId, pollInterval]);

  return (
    <ClappContext.Provider
      value={{ store: storeRef.current, client: clientRef.current }}
    >
      {children}
    </ClappContext.Provider>
  );
}

export function useClappContext(): ClappContextValue {
  const ctx = useContext(ClappContext);
  if (!ctx) throw new Error("useClappContext must be used within ClappProvider");
  return ctx;
}

/** Access clapp state by dot path */
export function useClappState<T = unknown>(path: string): T {
  const { store } = useClappContext();
  return useStore(store, (s) => {
    const parts = path.split(".");
    let current: unknown = s.state;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }) as T;
}

export function useClappLoading(): boolean {
  const { store } = useClappContext();
  return useStore(store, (s) => s.loading);
}

/** Emit an intent */
export function useIntent() {
  const { client } = useClappContext();
  return {
    emit: (intent: string, payload: Record<string, unknown> = {}) =>
      client.sendIntent(intent, payload),
  };
}
