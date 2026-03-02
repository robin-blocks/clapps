import { cn } from "@/lib/utils";

interface IconProps {
  name?: string;
  emoji?: string;
  className?: string;
}

export function Icon({ name, emoji, className }: IconProps) {
  // For now, just render emoji or a placeholder
  // Could be extended to use lucide-react icons
  if (emoji) {
    return <span className={cn("text-base leading-none", className)}>{emoji}</span>;
  }
  
  if (name) {
    // Placeholder for icon name - could map to lucide icons
    return <span className={cn("text-base leading-none", className)}>•</span>;
  }
  
  return null;
}
