import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Send, X, Plus, Paperclip } from "lucide-react";

interface PendingAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  isImage: boolean;
}

interface ChatInputProps {
  onSend: (text: string, attachments?: Array<{ name: string; mimeType: string; size: number; dataUrl: string }>) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled = false, placeholder = "Message..." }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  const toDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsDataURL(file);
    });

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    const mapped = await Promise.all(
      files.map(async (file, index) => {
        const dataUrl = await toDataUrl(file);
        return {
          id: `file-${Date.now()}-${index}`,
          name: file.name || `attachment-${Date.now()}`,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          dataUrl,
          isImage: file.type.startsWith("image/"),
        } satisfies PendingAttachment;
      }),
    );
    setAttachments((prev) => [...prev, ...mapped]);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (!imageItems.length) return;

    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter(Boolean) as File[];
    await addFiles(files);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await addFiles(files);
    e.target.value = "";
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;

    onSend(
      trimmed,
      attachments.map(({ id: _id, isImage: _isImage, ...rest }) => rest),
    );
    setValue("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="max-w-3xl mx-auto p-4">
        {!!attachments.length && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file) => (
              <div key={file.id} className="relative rounded-md border bg-muted/40 overflow-hidden">
                {file.isImage ? (
                  <img src={file.dataUrl} alt={file.name} className="h-16 w-16 object-cover" />
                ) : (
                  <div className="h-16 min-w-40 px-2 flex items-center gap-2 text-xs">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="truncate max-w-28">{file.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(file.id)}
                  className="absolute top-0.5 right-0.5 rounded-full bg-black/70 text-white p-0.5"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            "flex items-end gap-2 rounded-2xl border border-border bg-muted/30 p-2",
            "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
            disabled && "opacity-60",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
            accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 p-2 rounded-xl bg-background border border-border hover:bg-muted transition-colors"
            title="Add photos & files"
          >
            <Plus className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent px-2 py-1.5 text-sm",
              "placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed",
            )}
          />

          <button
            onClick={handleSubmit}
            disabled={disabled || (!value.trim() && attachments.length === 0)}
            className={cn(
              "shrink-0 p-2 rounded-xl transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          Enter to send • Shift+Enter newline • Paste images or use + for files
        </p>
      </div>
    </div>
  );
}
