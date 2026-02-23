import { motion, AnimatePresence } from 'motion/react';
import type { Variants } from 'motion/react';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { AdaptiveFocusRail } from '../features/adaptive-focus/AdaptiveFocusRail';
import { CloseLoopPanel } from '../features/close-loop/CloseLoopPanel';
import { CommandMeshPanel } from '../features/command-mesh/CommandMeshPanel';
import { DecisionGraphPanel } from '../features/decision-graph/DecisionGraphPanel';
import { DelegateLanesPanel } from '../features/delegate-lanes/DelegateLanesPanel';
import { OpsActivityFeedPanel } from '../features/ops-activity/OpsActivityFeedPanel';
import { PlaybooksPanel } from '../features/ops-playbooks/PlaybooksPanel';
import { PolicyControlPanel } from '../features/policy/PolicyControlPanel';
import { RuntimeControlPanel } from '../features/runtime/RuntimeControlPanel';
import { RuntimeIncidentTimelinePanel } from '../features/runtime/RuntimeIncidentTimelinePanel';
import { SpatialTwinPanel } from '../features/spatial-twin/SpatialTwinPanel';
import { TemporalIntelligencePanel } from '../features/temporal-intelligence/TemporalIntelligencePanel';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};

type Recommendation = Parameters<typeof DecisionGraphPanel>[0]['recommendations'][number];

type Props = {
  recommendations: Recommendation[];
  narrativePulseData: { summary?: string; generatedAtMs?: number; highlights?: string[]; actionHints?: string[] } | undefined;
  onStatus: (status: string) => void;
  onRoute: (route: string) => void;
};

export function AppShell({ recommendations, narrativePulseData, onStatus, onRoute }: Props) {
  return (
    <motion.main
      className="fo-main-grid"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      <aside className="fo-column fo-left-column" aria-label="Left panel">
        <ErrorBoundary zone="left">
          <motion.div variants={itemVariants}>
            <CloseLoopPanel onStatus={onStatus} />
          </motion.div>

          <motion.section className="fo-panel" variants={itemVariants}>
            <header className="fo-panel-header">
              <h2>Narrative Compression Pulse</h2>
              <small>Daily briefing compressed into top actionable outcomes.</small>
            </header>
            <div className="fo-stack">
              <motion.article className="fo-card" whileHover={{ scale: 1.01 }}>
                <strong>{narrativePulseData?.summary || 'Generating pulse...'}</strong>
                <small>
                  Generated:{' '}
                  {narrativePulseData?.generatedAtMs
                    ? new Date(narrativePulseData.generatedAtMs).toLocaleTimeString()
                    : '-'}
                </small>
              </motion.article>
              <AnimatePresence>
                {(narrativePulseData?.highlights || []).map((highlight, index) => (
                  <motion.article
                    className="fo-card"
                    key={highlight}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * index }}
                  >
                    <small>{highlight}</small>
                  </motion.article>
                ))}
              </AnimatePresence>
              {(narrativePulseData?.actionHints || []).map(hint => (
                <article className="fo-card" key={hint}>
                  <strong>{hint}</strong>
                </article>
              ))}
            </div>
          </motion.section>

          <motion.div variants={itemVariants}>
            <TemporalIntelligencePanel onStatus={onStatus} onRoute={onRoute} />
          </motion.div>
        </ErrorBoundary>
      </aside>

      <section className="fo-column fo-center-column" aria-label="Center panel">
        <ErrorBoundary zone="center">
          <motion.div variants={itemVariants}>
            <CommandMeshPanel onRoute={onRoute} onStatus={onStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <PlaybooksPanel onStatus={onStatus} onRoute={onRoute} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <SpatialTwinPanel onStatus={onStatus} onRoute={onRoute} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <DecisionGraphPanel
              recommendations={recommendations}
              onStatus={onStatus}
              onRoute={onRoute}
            />
          </motion.div>
        </ErrorBoundary>
      </section>

      <aside className="fo-column fo-right-column" aria-label="Right panel">
        <ErrorBoundary zone="right">
          <motion.div variants={itemVariants}>
            <AdaptiveFocusRail onRoute={onRoute} onStatus={onStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <OpsActivityFeedPanel onRoute={onRoute} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <RuntimeIncidentTimelinePanel onRoute={onRoute} onStatus={onStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <DelegateLanesPanel onStatus={onStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <PolicyControlPanel onStatus={onStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <RuntimeControlPanel onStatus={onStatus} />
          </motion.div>
        </ErrorBoundary>
      </aside>
    </motion.main>
  );
}
