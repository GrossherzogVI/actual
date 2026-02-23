import type { AppRecommendation } from '../../core/types';

type DecisionGraphPanelProps = {
  recommendations: AppRecommendation[];
};

function short(text: string, max = 16) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function DecisionGraphPanel({ recommendations }: DecisionGraphPanelProps) {
  const first = recommendations[0];
  const second = recommendations[1];
  const primaryTitle = first ? short(first.title, 14) : 'Renewal';
  const impactTitle = first ? short(first.expectedImpact, 14) : 'Cashflow';
  const rationaleTitle = second ? short(second.rationale, 14) : 'Deadline';
  const actionTitle = first
    ? `${Math.round(first.confidence * 100)}% conf`
    : 'Action';

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Decision Graph</h2>
        <small>Causal narrative behind recommendations.</small>
      </header>

      <div className="fo-decision-graph">
        <svg width="100%" height="280" viewBox="0 0 560 280" preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="decision-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#4a6f99" />
            </marker>
          </defs>

          <line x1="120" y1="140" x2="260" y2="70" stroke="#4a6f99" strokeWidth="2" markerEnd="url(#decision-arrow)" />
          <line x1="120" y1="140" x2="260" y2="210" stroke="#4a6f99" strokeWidth="2" markerEnd="url(#decision-arrow)" />
          <line x1="320" y1="70" x2="450" y2="140" stroke="#4a6f99" strokeWidth="2" markerEnd="url(#decision-arrow)" />
          <line x1="320" y1="210" x2="450" y2="140" stroke="#4a6f99" strokeWidth="2" markerEnd="url(#decision-arrow)" />

          <g className="fo-graph-node" transform="translate(70 115)">
            <rect width="110" height="50" rx="10" />
            <text x="55" y="30" textAnchor="middle">
              {primaryTitle}
            </text>
          </g>

          <g className="fo-graph-node fo-graph-node-info" transform="translate(260 45)">
            <rect width="120" height="50" rx="10" />
            <text x="60" y="30" textAnchor="middle">
              {impactTitle}
            </text>
          </g>

          <g className="fo-graph-node fo-graph-node-warn" transform="translate(260 185)">
            <rect width="120" height="50" rx="10" />
            <text x="60" y="30" textAnchor="middle">
              {rationaleTitle}
            </text>
          </g>

          <g className="fo-graph-node fo-graph-node-ok" transform="translate(450 115)">
            <rect width="90" height="50" rx="10" />
            <text x="45" y="30" textAnchor="middle">
              {actionTitle}
            </text>
          </g>
        </svg>
      </div>
    </section>
  );
}
