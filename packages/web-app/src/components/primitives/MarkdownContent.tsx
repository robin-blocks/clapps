import ReactMarkdown from "react-markdown";
import { useClappState } from "@clapps/renderer";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  source?: string; // State binding path
  content?: string; // Direct content (not from state)
  className?: string;
}

export function MarkdownContent({ source, content, className }: MarkdownContentProps) {
  // Get content from state if source is provided
  const stateContent = useClappState<string>(source || "_empty_");
  const markdown = content ?? stateContent ?? "";
  
  if (!markdown) {
    return null;
  }
  
  return (
    <div className={cn("prose prose-invert prose-sm max-w-none", className)}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="my-2 text-sm leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside my-2 text-sm">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-2 text-sm">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
            ) : (
              <code className={className}>{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-card border border-border rounded-md p-3 overflow-x-auto my-2 text-xs">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary pl-3 my-2 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
