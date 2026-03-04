import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { User, Bot, Loader2, Paperclip } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ChatAttachment {
  id: string;
  type: "image" | "file";
  name: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[];
}

interface ChatMessagesProps {
  messages: Message[];
  loading: boolean;
  loadingText?: string;
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
}

export function ChatMessages({ messages, loading, loadingText = "Thinking...", hasMore = false, loadingOlder = false, onLoadOlder }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isInitialScroll = useRef(true);

  // Reset initial scroll flag when messages clear (session switch)
  useEffect(() => {
    if (messages.length === 0) {
      isInitialScroll.current = true;
    }
  }, [messages.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isInitialScroll.current && messages.length > 0) {
      isInitialScroll.current = false;
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      return;
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 200 || loading) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
          <p className="text-muted-foreground">Start a conversation by typing a message below.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loadingOlder && <div className="text-center text-xs text-muted-foreground">Loading older messages…</div>}
        {hasMore && !loadingOlder && <div className="text-center text-xs text-muted-foreground">Scroll up to load older messages</div>}

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
                <span className="text-sm line-clamp-2">{loadingText}</span>
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
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">{message.content}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-4", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-primary text-primary-foreground" : "bg-primary/10",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
      </div>

      <div className={cn("flex-1 min-w-0 pt-1", isUser && "text-right")}>
        <div
          className={cn(
            "inline-block text-left rounded-2xl px-4 py-2 max-w-full",
            isUser ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm",
          )}
        >
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {message.attachments
                  .filter((attachment) => attachment.type === "image")
                  .map((attachment) => (
                    <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer">
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="rounded-md border border-black/10 dark:border-white/10 max-h-52 object-cover"
                        loading="lazy"
                      />
                    </a>
                  ))}
              </div>

              {message.attachments
                .filter((attachment) => attachment.type === "file")
                .map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border border-black/10 dark:border-white/10 px-2 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="truncate">{attachment.name}</span>
                  </a>
                ))}
            </div>
          )}

          {message.content && (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words">
              <ReactMarkdown
                components={{
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
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
