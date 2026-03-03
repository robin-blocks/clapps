import { useState, useEffect, useRef } from "react";
import { useClappState, useIntent } from "@clapps/renderer";
import { cn } from "@/lib/utils";
import { Menu, X, Plus, MessageSquare, Trash2 } from "lucide-react";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";

interface Session {
  key: string;
  title: string;
  preview: string;
  updatedAt: string;
  messageCount: number;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

interface ChatState {
  sessions: Session[];
  activeSession: string | null;
  messages: Message[];
  loading: boolean;
  loadingOlder?: boolean;
  hasMore?: boolean;
}

export function ChatLayout() {
  const chatState = useClappState<ChatState>("chat");
  const sessions = chatState?.sessions ?? [];
  const activeSession = chatState?.activeSession;
  const messages = chatState?.messages ?? [];
  const loading = chatState?.loading ?? false;
  const loadingOlder = chatState?.loadingOlder ?? false;
  const hasMore = chatState?.hasMore ?? false;

  const { emit } = useIntent();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const initRef = useRef(false);

  // Close sidebar on mobile when session changes
  useEffect(() => {
    if (activeSession) {
      setSidebarOpen(false);
    }
  }, [activeSession]);

  // Request initial data on mount (only once)
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      emit("chat.init", {});
    }
  }, [emit]);

  const handleNewChat = () => {
    emit("chat.newSession", {});
    setSidebarOpen(false);
  };

  const handleSelectSession = (sessionKey: string) => {
    if (sessionKey !== activeSession) {
      emit("chat.switchSession", { sessionKey });
    }
    setSidebarOpen(false);
  };

  const handleDeleteSession = (sessionKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingSession(sessionKey);
    emit("chat.deleteSession", { sessionKey });
    setTimeout(() => setDeletingSession(null), 1000);
  };

  const handleSendMessage = (text: string) => {
    emit("chat.send", { text });
  };

  const handleLoadOlder = () => {
    if (!loadingOlder && hasMore) {
      emit("chat.loadOlder", {});
    }
  };

  const activeSessionData = sessions.find(s => s.key === activeSession);

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-72 bg-muted/50 border-r border-border",
          "transform transition-transform duration-200 ease-in-out",
          "flex flex-col",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-sm">Chats</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewChat}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              title="New chat"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-md hover:bg-muted transition-colors lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No conversations yet
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <button
                  key={session.key}
                  onClick={() => handleSelectSession(session.key)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-colors group",
                    "hover:bg-muted",
                    session.key === activeSession && "bg-muted"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {session.title || "New conversation"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {session.preview || "No messages"}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(session.key, e)}
                      className={cn(
                        "p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity",
                        "hover:bg-destructive/20 hover:text-destructive",
                        deletingSession === session.key && "opacity-100"
                      )}
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-md hover:bg-muted transition-colors lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">
              {activeSessionData?.title || "New conversation"}
            </h1>
          </div>
        </header>

        {/* Messages */}
        <ChatMessages
          messages={messages}
          loading={loading}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          onLoadOlder={handleLoadOlder}
        />

        {/* Input */}
        <ChatInput onSend={handleSendMessage} disabled={loading} />
      </main>
    </div>
  );
}
