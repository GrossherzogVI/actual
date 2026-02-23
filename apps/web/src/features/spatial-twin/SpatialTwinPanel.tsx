const branches = [
  {
    id: 'baseline',
    title: 'Baseline Cashflow',
    subtitle: 'Current state projection',
    color: 'var(--fo-info)',
    top: 120,
    left: 30,
  },
  {
    id: 'branch-a',
    title: 'Branch A',
    subtitle: 'Cancel SaaS bundle (+420 EUR/Q)',
    color: 'var(--fo-ok)',
    top: 30,
    left: 280,
  },
  {
    id: 'branch-b',
    title: 'Branch B',
    subtitle: 'Renegotiate insurance (-3 risk pts)',
    color: 'var(--fo-accent)',
    top: 210,
    left: 280,
  },
];

export function SpatialTwinPanel() {
  return (
    <section className="fo-panel fo-twin-panel">
      <header className="fo-panel-header">
        <h2>Spatial Finance Twin</h2>
        <small>Scenario branches with direct impact and risk deltas.</small>
      </header>

      <div className="fo-twin-canvas">
        <svg width="100%" height="100%" viewBox="0 0 560 300" preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#4a6f99" />
            </marker>
          </defs>
          <line x1="200" y1="145" x2="280" y2="80" stroke="#4a6f99" strokeWidth="2" markerEnd="url(#arrow)" />
          <line x1="200" y1="145" x2="280" y2="250" stroke="#4a6f99" strokeWidth="2" markerEnd="url(#arrow)" />
          <text x="206" y="102" fill="#8ea6c2" fontSize="10" fontFamily="JetBrains Mono">
            +420 EUR/Q
          </text>
          <text x="206" y="226" fill="#8ea6c2" fontSize="10" fontFamily="JetBrains Mono">
            -3 risk pts
          </text>
        </svg>

        {branches.map(branch => (
          <article
            key={branch.id}
            className="fo-twin-node"
            style={{ top: branch.top, left: branch.left, borderColor: branch.color }}
          >
            <strong>{branch.title}</strong>
            <small>{branch.subtitle}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
