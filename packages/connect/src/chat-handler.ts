import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { IntentMessage } from "@clapps/core";
import type { StateStore } from "./state-store.js";
import type { AgentClient } from "./agent-client.js";

export interface ChatHandlerOptions {
  stateDir: string;
  store: StateStore;
  agentClient: AgentClient;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

interface Session {
  key: string;
  acpSessionKey: string;
  title: string;
  preview: string;
  updatedAt: string;
  messageCount: number;
}

interface ChatState {
  sessions: Session[];
  activeSession: string | null;
  messages: Message[];
  loading: boolean;
  loadingOlder: boolean;
  loadedCount: number;
  hasMore: boolean;
}

const PAGE_SIZE = 30;

export class ChatHandler {
  private stateDir: string;
  private store: StateStore;
  private agentClient: AgentClient;
  private sessionsDir: string;

  constructor(options: ChatHandlerOptions) {
    this.stateDir = options.stateDir;
    this.store = options.store;
    this.agentClient = options.agentClient;
    this.sessionsDir = resolve(homedir(), ".openclaw", "workspace", "chat-sessions");
    
    // Ensure sessions directory exists
    mkdirSync(this.sessionsDir, { recursive: true });
  }

  /** Returns true if the intent was handled */
  handleIntent = (intent: IntentMessage): boolean => {
    if (!intent.intent.startsWith("chat.")) return false;

    switch (intent.intent) {
      case "chat.init": {
        this.initChat();
        return true;
      }
      case "chat.send": {
        const text = intent.payload.text;
        if (typeof text !== "string" || text.trim().length === 0) {
          return true;
        }
        this.sendMessage(text.trim());
        return true;
      }
      case "chat.newSession": {
        this.createNewSession();
        return true;
      }
      case "chat.switchSession": {
        const sessionKey = intent.payload.sessionKey;
        if (typeof sessionKey === "string") {
          this.switchSession(sessionKey);
        }
        return true;
      }
      case "chat.deleteSession": {
        const sessionKey = intent.payload.sessionKey;
        if (typeof sessionKey === "string") {
          this.deleteSession(sessionKey);
        }
        return true;
      }
      case "chat.loadOlder": {
        this.loadOlder();
        return true;
      }
      default:
        return false;
    }
  };

  /** Initialize chat state */
  private initChat(): void {
    let sessions = this.loadSessions();
    let activeSession = sessions[0]?.key ?? null;

    // Create a default session if none exist
    if (sessions.length === 0) {
      const newSession = this.createSessionData();
      sessions.push(newSession);
      activeSession = newSession.key;
      this.saveSessionMessages(newSession.key, []);
      this.saveSessions(sessions);
    }

    sessions = this.refreshSessionsFromFiles(sessions);
    let allMessages = activeSession ? this.loadSessionMessages(activeSession) : [];
    const loadedCount = Math.min(PAGE_SIZE, allMessages.length);
    const messages = allMessages.slice(-loadedCount);

    this.pushState({
      sessions,
      activeSession,
      messages,
      loading: false,
      loadingOlder: false,
      loadedCount,
      hasMore: allMessages.length > loadedCount,
    });
  }

  /** Send a message to the active session */
  private sendMessage(text: string): void {
    const state = this.getCurrentState();
    let { sessions, activeSession } = state;

    // Create session if none active
    if (!activeSession) {
      const newSession = this.createSessionData();
      sessions = [newSession, ...sessions];
      activeSession = newSession.key;
    }

    const activeMeta = sessions.find((s) => s.key === activeSession)!;
    const allBefore = this.loadSessionMessages(activeSession);

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    const allWithUser = [...allBefore, userMessage];
    this.saveSessionMessages(activeSession, allWithUser);

    const loadedCount = Math.min(allWithUser.length, Math.max(state.loadedCount, PAGE_SIZE) + 1);
    const messages = allWithUser.slice(-loadedCount);

    sessions = this.refreshSessionsFromFiles(sessions);

    // Update state with user message and loading
    this.pushState({
      sessions,
      activeSession,
      messages,
      loading: true,
      loadingOlder: false,
      loadedCount,
      hasMore: allWithUser.length > loadedCount,
    });

    // Send to OpenClaw and get response
    this.getAssistantResponse(activeSession, activeMeta.acpSessionKey, text, allWithUser, loadedCount);
  }

  /** Get assistant response from OpenClaw via ACP */
  private async getAssistantResponse(sessionKey: string, acpSessionKey: string, userText: string, allCurrentMessages: Message[], loadedCountBefore: number): Promise<void> {
    try {
      console.log(`[chat] Sending message to ACP: "${userText.slice(0, 50)}..."`);
      
      // Send message via ACP and get response
      const response = await this.agentClient.sendMessage(userText, acpSessionKey);
      
      console.log(`[chat] Got response (${response?.length ?? 0} chars): "${response?.slice(0, 100)}..."`);
      
      const rawContent = response || "I apologize, but I encountered an error processing your request.";
      const assistantContent = rawContent.replace(/^\s*\[\[[^\]]+\]\]\s*/u, "");

      // Add assistant message
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content: assistantContent,
        timestamp: new Date().toISOString(),
      };

      const allUpdatedMessages = [...allCurrentMessages, assistantMessage];

      this.saveSessionMessages(sessionKey, allUpdatedMessages);
      const sessions = this.refreshSessionsFromFiles(this.loadSessions()).map((s) =>
        s.key === sessionKey && !s.title
          ? { ...s, title: this.generateTitle(userText) }
          : s,
      );
      this.saveSessions(sessions);

      const loadedCount = Math.min(allUpdatedMessages.length, loadedCountBefore + 1);
      const messages = allUpdatedMessages.slice(-loadedCount);

      this.pushState({
        sessions,
        activeSession: sessionKey,
        messages,
        loading: false,
        loadingOlder: false,
        loadedCount,
        hasMore: allUpdatedMessages.length > loadedCount,
      });

    } catch (err) {
      console.error(`[chat] Error getting response: ${err}`);
      
      // Show error to user
      const errorMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content: `Sorry, I couldn't process your request: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      };

      const allUpdatedMessages = [...allCurrentMessages, errorMessage];
      this.saveSessionMessages(sessionKey, allUpdatedMessages);
      const loadedCount = Math.min(allUpdatedMessages.length, loadedCountBefore + 1);

      this.pushState({
        sessions: this.refreshSessionsFromFiles(this.loadSessions()),
        activeSession: sessionKey,
        messages: allUpdatedMessages.slice(-loadedCount),
        loading: false,
        loadingOlder: false,
        loadedCount,
        hasMore: allUpdatedMessages.length > loadedCount,
      });
    }
  }

  /** Create a new session */
  private createNewSession(): void {
    const state = this.getCurrentState();
    const newSession = this.createSessionData();
    
    const sessions = [newSession, ...state.sessions];
    this.saveSessions(sessions);
    this.saveSessionMessages(newSession.key, []);

    this.pushState({
      sessions,
      activeSession: newSession.key,
      messages: [],
      loading: false,
      loadingOlder: false,
      loadedCount: 0,
      hasMore: false,
    });
  }

  /** Switch to a different session */
  private switchSession(sessionKey: string): void {
    const state = this.getCurrentState();
    const target = state.sessions.find((s) => s.key === sessionKey);
    const allMessages = target ? this.hydrateSessionFromAcpLog(target) : this.loadSessionMessages(sessionKey);
    const loadedCount = Math.min(PAGE_SIZE, allMessages.length);

    this.pushState({
      ...state,
      sessions: this.refreshSessionsFromFiles(state.sessions),
      activeSession: sessionKey,
      messages: allMessages.slice(-loadedCount),
      loading: false,
      loadingOlder: false,
      loadedCount,
      hasMore: allMessages.length > loadedCount,
    });
  }

  /** Load older messages for the active session */
  private loadOlder(): void {
    const state = this.getCurrentState();
    const sessionKey = state.activeSession;
    if (!sessionKey || state.loadingOlder || !state.hasMore) return;

    this.pushState({ ...state, loadingOlder: true });

    const allMessages = this.loadSessionMessages(sessionKey);
    const newLoadedCount = Math.min(allMessages.length, state.loadedCount + PAGE_SIZE);

    this.pushState({
      ...state,
      loadingOlder: false,
      loadedCount: newLoadedCount,
      hasMore: allMessages.length > newLoadedCount,
      messages: allMessages.slice(-newLoadedCount),
    });
  }

  /** Delete a session */
  private deleteSession(sessionKey: string): void {
    const state = this.getCurrentState();
    const sessions = state.sessions.filter(s => s.key !== sessionKey);
    
    this.saveSessions(sessions);

    // Delete messages file
    const messagesPath = resolve(this.sessionsDir, `${sessionKey}.json`);
    try {
      if (existsSync(messagesPath)) {
        writeFileSync(messagesPath, "[]", "utf-8");
      }
    } catch {
      // Ignore
    }

    // Switch to another session if we deleted the active one
    let activeSession = state.activeSession;
    let messages = state.messages;

    if (sessionKey === state.activeSession) {
      activeSession = sessions[0]?.key ?? null;
      messages = activeSession ? this.loadSessionMessages(activeSession) : [];
    }

    const loadedCount = messages.length;
    this.pushState({
      sessions: this.refreshSessionsFromFiles(sessions),
      activeSession,
      messages,
      loading: false,
      loadingOlder: false,
      loadedCount,
      hasMore: activeSession ? this.loadSessionMessages(activeSession).length > loadedCount : false,
    });
  }

  /** Generate a title from the first message */
  private generateTitle(text: string): string {
    const cleaned = text.replace(/\n/g, " ").trim();
    if (cleaned.length <= 40) return cleaned;
    return cleaned.slice(0, 37) + "...";
  }

  /** Create a new session data object */
  private createSessionData(): Session {
    const id = Date.now();
    return {
      key: `session-${id}`,
      acpSessionKey: `agent:main:clapps-chat:${id}`,
      title: "",
      preview: "",
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
  }

  /** Load all sessions */
  private loadSessions(): Session[] {
    const sessionsPath = resolve(this.sessionsDir, "_sessions.json");
    try {
      if (existsSync(sessionsPath)) {
        const parsed = JSON.parse(readFileSync(sessionsPath, "utf-8")) as Array<Partial<Session>>;
        return (parsed ?? []).map((s) => ({
          key: s.key ?? `session-${Date.now()}`,
          acpSessionKey: s.acpSessionKey ?? "agent:main:clapps-chat",
          title: s.title ?? "",
          preview: s.preview ?? "",
          updatedAt: s.updatedAt ?? new Date().toISOString(),
          messageCount: s.messageCount ?? 0,
        }));
      }
    } catch {
      // Return empty
    }
    return [];
  }

  /** Save sessions list */
  private saveSessions(sessions: Session[]): void {
    const sessionsPath = resolve(this.sessionsDir, "_sessions.json");
    writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2), "utf-8");
  }

  /** Refresh sidebar session metadata from session message files */
  private refreshSessionsFromFiles(sessions: Session[]): Session[] {
    const refreshed = sessions.map((s) => {
      const messages = this.loadSessionMessages(s.key);
      const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
      const last = messages[messages.length - 1];
      const preview = last?.content?.slice(0, 100) ?? "";
      const updatedAt = last?.timestamp ?? s.updatedAt;
      const title = s.title || this.generateTitle(firstUser || "New conversation");

      return {
        ...s,
        title,
        preview,
        updatedAt,
        messageCount: messages.length,
      };
    });

    return refreshed.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  /** Load messages for a session */
  private loadSessionMessages(sessionKey: string): Message[] {
    const messagesPath = resolve(this.sessionsDir, `${sessionKey}.json`);
    try {
      if (existsSync(messagesPath)) {
        return JSON.parse(readFileSync(messagesPath, "utf-8"));
      }
    } catch {
      // Return empty
    }
    return [];
  }

  /** Save messages for a session */
  private saveSessionMessages(sessionKey: string, messages: Message[]): void {
    const messagesPath = resolve(this.sessionsDir, `${sessionKey}.json`);
    writeFileSync(messagesPath, JSON.stringify(messages, null, 2), "utf-8");
  }

  /** If local transcript is empty, hydrate it from OpenClaw session jsonl */
  private hydrateSessionFromAcpLog(session: Session): Message[] {
    const existing = this.loadSessionMessages(session.key);
    if (existing.length > 0) return existing;

    try {
      const sessionsMapPath = resolve(homedir(), ".openclaw", "agents", "main", "sessions", "sessions.json");
      if (!existsSync(sessionsMapPath)) return existing;
      const sessionsMap = JSON.parse(readFileSync(sessionsMapPath, "utf-8")) as Record<string, { sessionId?: string }>;
      const sessionMeta = sessionsMap[session.acpSessionKey];
      if (!sessionMeta?.sessionId) return existing;

      const jsonlPath = resolve(homedir(), ".openclaw", "agents", "main", "sessions", `${sessionMeta.sessionId}.jsonl`);
      if (!existsSync(jsonlPath)) return existing;

      const lines = readFileSync(jsonlPath, "utf-8").trim().split("\n");
      const hydrated: Message[] = [];

      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          if (row?.type !== "message") continue;
          const msg = row?.message;
          if (!msg || (msg.role !== "user" && msg.role !== "assistant")) continue;

          const parts = Array.isArray(msg.content) ? msg.content : [];
          const text = parts
            .filter((p: { type?: string; text?: string }) => p?.type === "text" && typeof p?.text === "string")
            .map((p: { text: string }) => p.text)
            .join("\n")
            .trim();

          if (!text) continue;

          hydrated.push({
            id: row.id ?? `msg-${Date.now()}-${hydrated.length}`,
            role: msg.role,
            content: text.replace(/^\s*\[\[[^\]]+\]\]\s*/u, ""),
            timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : (row.timestamp ?? new Date().toISOString()),
          });
        } catch {
          // ignore malformed row
        }
      }

      if (hydrated.length > 0) {
        this.saveSessionMessages(session.key, hydrated);
        return hydrated;
      }
    } catch {
      // ignore hydrate failures
    }

    return existing;
  }

  /** Get current state */
  private getCurrentState(): ChatState {
    // Prefer last pushed UI state if available
    const statePath = resolve(this.stateDir, "chat.json");
    try {
      if (existsSync(statePath)) {
        const parsed = JSON.parse(readFileSync(statePath, "utf-8"));
        const chat = parsed?.state?.chat;
        if (chat && typeof chat === "object") {
          return {
            sessions: Array.isArray(chat.sessions) ? chat.sessions : this.loadSessions(),
            activeSession: typeof chat.activeSession === "string" ? chat.activeSession : null,
            messages: Array.isArray(chat.messages) ? chat.messages : [],
            loading: Boolean(chat.loading),
            loadingOlder: Boolean(chat.loadingOlder),
            loadedCount: Number(chat.loadedCount ?? (Array.isArray(chat.messages) ? chat.messages.length : 0)),
            hasMore: Boolean(chat.hasMore),
          };
        }
      }
    } catch {
      // fallback below
    }

    const sessions = this.loadSessions();
    const activeSession = sessions[0]?.key ?? null;
    const messages = activeSession ? this.loadSessionMessages(activeSession) : [];

    return {
      sessions,
      activeSession,
      messages,
      loading: false,
      loadingOlder: false,
      loadedCount: messages.length,
      hasMore: activeSession ? this.loadSessionMessages(activeSession).length > messages.length : false,
    };
  }

  /** Push state to store */
  private pushState(chatState: ChatState): void {
    const state = {
      version: Date.now(),
      timestamp: new Date().toISOString(),
      state: {
        chat: chatState,
      },
    };

    const statePath = resolve(this.stateDir, "chat.json");
    writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
    this.store.setState("chat", state);
  }
}
