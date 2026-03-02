import { Skeleton as ShadSkeleton } from "@/components/ui/skeleton";

export function Skeleton() {
  return (
    <div className="flex flex-col gap-2 py-2">
      <ShadSkeleton className="h-4 w-4/5" />
      <ShadSkeleton className="h-4 w-3/5" />
      <ShadSkeleton className="h-4 w-4/5" />
    </div>
  );
}
