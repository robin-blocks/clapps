import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { User, Bot, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

interface ChatMessagesProps {
  messages: Message[];
  loading: boolean;
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
}

export function ChatMessages({ messages, loading, hasMore = false, loadingOlder = false, onLoadOlder }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages unless user is reading older history
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 200 || loading) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container || !hasMore || loadingOlder || !onLoadOlder) return;
    if (container.scrollTop < 120) {
      onLoadOlder();
    }
  };

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-semibold mb-2">What can I do for you?</h2>
          <p className="text-muted-foreground">
            Start a conversation by typing a message below.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loadingOlder && (
          <div className="text-center text-xs text-muted-foreground">Loading older messages…</div>
        )}
        {hasMore && !loadingOlder && (
          <div className="text-center text-xs text-muted-foreground">Scroll up to load older messages</div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {loading && (
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 pt-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="text-center">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-4", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-primary text-primary-foreground" : "bg-primary/10"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>

      <div
        className={cn(
          "flex-1 min-w-0 pt-1",
          isUser && "text-right"
        )}
      >
        <div
          className={cn(
            "inline-block text-left rounded-2xl px-4 py-2 max-w-full",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted rounded-tl-sm"
          )}
        >
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown
              components={{
                // Simplify code blocks
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    );
                  }
                  return (
                    <pre className="bg-black/10 dark:bg-white/10 p-3 rounded-lg overflow-x-auto my-2">
                      <code className="text-sm" {...props}>
                        {children}
                      </code>
                    </pre>
                  );
                },
                // Remove paragraph margins for cleaner bubbles
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
