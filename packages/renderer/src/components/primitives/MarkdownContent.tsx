import ReactMarkdown from "react-markdown";
import { useClappState } from "../../context/ClappProvider.js";

interface MarkdownContentProps {
  source: string;
}

export function MarkdownContent({ source }: MarkdownContentProps) {
  const content = useClappState<string>(source);
  if (!content) return <div className="clapp-empty">No content selected</div>;
  return (
    <div className="clapp-markdown">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
