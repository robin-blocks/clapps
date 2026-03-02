import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { ClappTransport } from "@clapps/transport";
import type { ClappState } from "@clapps/core";

interface ClappStoreState {
  state: Record<string, unknown>;
  version: number;
  loading: boolean;
  connected: boolean;
  applyState: (clappState: ClappState) => void;
  setConnected: (connected: boolean) => void;
}

function createClappStore() {
  return createStore<ClappStoreState>((set) => ({
    state: {},
    version: -1,
    loading: true,
    connected: false,
    applyState: (clappState: ClappState) =>
      set({
        state: clappState.state,
        version: clappState.version,
        loading: false,
      }),
    setConnected: (connected: boolean) => set({ connected }),
  }));
}

interface ClappContextValue {
  store: StoreApi<ClappStoreState>;
  transport: ClappTransport;
  clappId: string;
}

const ClappContext = createContext<ClappContextValue | null>(null);

export interface ClappProviderProps {
  serverUrl: string;
  clappId: string;
  children: ReactNode;
  transport?: ClappTransport; // allow sharing a transport across providers
}

export function ClappProvider({
  serverUrl,
  clappId,
  children,
  transport: externalTransport,
}: ClappProviderProps) {
  const storeRef = useRef<StoreApi<ClappStoreState>>(undefined);
  const transportRef = useRef<ClappTransport>(undefined);

  if (!storeRef.current) {
    storeRef.current = createClappStore();
  }
  if (!transportRef.current) {
    transportRef.current = externalTransport ?? new ClappTransport({ serverUrl });
  }

  useEffect(() => {
    const store = storeRef.current!;
    const transport = transportRef.current!;

    // Subscribe to state updates for this clapp
    const unsub = transport.onState((id, state) => {
      if (id === clappId) {
        store.getState().applyState(state);
      }
    });

    const unsubConn = transport.onConnection((connected) => {
      store.getState().setConnected(connected);
    });

    // Connect and subscribe
    transport.connect();
    transport.subscribe([clappId]);

    // Fetch initial state via HTTP
    transport.fetchState(clappId).then((state) => {
      if (state) {
        store.getState().applyState(state);
      }
    }).catch(() => {
      // Will get state via WS when connected
    });

    return () => {
      unsub();
      unsubConn();
      // Only disconnect if we own the transport
      if (!externalTransport) {
        transport.disconnect();
      }
    };
  }, [serverUrl, clappId, externalTransport]);

  return (
    <ClappContext.Provider
      value={{ store: storeRef.current, transport: transportRef.current, clappId }}
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

export function useClappConnected(): boolean {
  const { store } = useClappContext();
  return useStore(store, (s) => s.connected);
}

/** Emit an intent */
export function useIntent() {
  const { transport, clappId } = useClappContext();
  return {
    emit: (intent: string, payload: Record<string, unknown> = {}) =>
      transport.sendIntent(clappId, intent, payload),
  };
}
