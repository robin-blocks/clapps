interface SkeletonProps {
  lines?: number;
}

export function Skeleton({ lines = 3 }: SkeletonProps) {
  return (
    <div className="clapp-skeleton">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="clapp-skeleton-line" />
      ))}
    </div>
  );
}
