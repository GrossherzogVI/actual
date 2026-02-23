type Props = {
  rows?: number;
};

export function PanelSkeleton({ rows = 4 }: Props) {
  return (
    <div className="fo-panel" aria-busy="true" aria-label="Loading...">
      <div className="fo-panel-header">
        <div className="animate-pulse bg-white/10 rounded h-4 w-1/3" />
        <div className="animate-pulse bg-white/10 rounded h-3 w-1/2 mt-1" />
      </div>
      <div className="fo-stack">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-white/10 rounded h-10 w-full"
            style={{ opacity: 1 - i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
