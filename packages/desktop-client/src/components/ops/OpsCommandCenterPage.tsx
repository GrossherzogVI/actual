// @ts-strict-ignore
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import {
  SvgCheckmark,
  SvgDashboard,
  SvgQueue,
  SvgRefresh,
  SvgTimer,
} from '@actual-app/components/icons/v1';
import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { useOpsCommandCenter } from './hooks/useOpsCommandCenter';

type CommandLog = {
  id: string;
  step: string;
  status: 'ok' | 'error';
  detail: string;
};

function isErrorResult(value: unknown): value is { error: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof (value as { error?: unknown }).error === 'string'
  );
}

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function CommandHint({
  command,
  description,
  onRun,
}: {
  command: string;
  description: string;
  onRun: (command: string) => void;
}) {
  return (
    <View
      style={{
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 6,
        padding: 10,
        gap: 6,
      }}
    >
      <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{command}</Text>
      <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
        {description}
      </Text>
      <Button
        variant="bare"
        style={{ fontSize: 12, alignSelf: 'flex-start' }}
        onPress={() => onRun(command)}
      >
        <Trans>Run</Trans>
      </Button>
    </View>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <View
      style={{
        border: `1px solid ${theme.tableBorder}`,
        backgroundColor: theme.tableBackground,
        borderRadius: 8,
        padding: 12,
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 11, textTransform: 'uppercase', color: theme.pageTextSubdued }}>
        {title}
      </Text>
      <Text style={{ fontSize: 22, fontWeight: 600 }}>{value}</Text>
      {subtitle ? (
        <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function OpsCommandCenterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const commandMesh = useFeatureFlag('commandMesh');
  const adaptiveFocusEnabled = useFeatureFlag('adaptiveFocus');
  const opsPlaybooks = useFeatureFlag('opsPlaybooks');
  const delegateLanesEnabled = useFeatureFlag('delegateLanes');
  const closeLoopEnabled = useFeatureFlag('closeLoop');

  const {
    loading,
    error,
    moneyPulse,
    adaptiveFocus,
    playbooks,
    lanes,
    commandRuns,
    refresh,
    runCloseRoutine,
    runPlaybook,
    executeCommandChain,
  } = useOpsCommandCenter();

  const [commandInput, setCommandInput] = useState(
    'triage -> expiring<30d -> batch-renegotiate',
  );
  const [commandLogs, setCommandLogs] = useState<CommandLog[]>([]);
  const [executing, setExecuting] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [dryRunMode, setDryRunMode] = useState(true);

  const loopShortcuts = useMemo(
    () => [
      { id: '1', label: t('Morning'), route: '/ops' },
      { id: '2', label: t('Capture'), route: '/quick-add' },
      { id: '3', label: t('Triage'), route: '/review?priority=urgent' },
      { id: '4', label: t('Execution'), route: '/contracts?filter=expiring' },
      { id: '5', label: t('Close'), route: '/ops' },
      { id: '6', label: t('Simulation'), route: '/ops' },
    ],
    [t],
  );

  const commandHints = useMemo(
    () => [
      {
        command: 'triage -> resolve-next',
        description: t('Loads next high-impact action and opens the target surface.'),
      },
      {
        command: 'close -> weekly',
        description: t('Runs weekly close routine and refreshes exception pressure.'),
      },
      {
        command: 'playbook -> create-default -> run-first',
        description: t('Creates a baseline playbook and executes a dry run.'),
      },
      {
        command: 'expiring<30d -> batch-renegotiate',
        description: t('Jumps to expiring contracts and creates delegate mission lane.'),
      },
    ],
    [t],
  );

  const appendLog = useCallback((log: CommandLog) => {
    setCommandLogs(prev => [log, ...prev].slice(0, 20));
  }, []);

  const executeChain = useCallback(
    async (chain: string) => {
      setExecuting(true);
      try {
        const run = await executeCommandChain(
          chain,
          operatorName.trim() || undefined,
          dryRunMode,
        );

        if (isErrorResult(run)) {
          appendLog({
            id: nowId(),
            step: t('command'),
            status: 'error',
            detail: String(run.error),
          });
          return;
        }

        const steps = Array.isArray(run.steps) ? run.steps : [];
        for (const step of steps) {
          if (step.route) {
            await navigate(String(step.route));
          }

          appendLog({
            id: nowId(),
            step: String(step.raw || step.id || t('command')),
            status: step.status === 'error' ? 'error' : 'ok',
            detail: String(step.detail || ''),
          });
        }
      } finally {
        setExecuting(false);
      }
    },
    [appendLog, dryRunMode, executeCommandChain, navigate, operatorName, t],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !/^[1-6]$/.test(event.key)) {
        return;
      }
      const target = loopShortcuts.find(loop => loop.id === event.key);
      if (!target) {
        return;
      }
      event.preventDefault();
      void navigate(target.route);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [loopShortcuts, navigate]);

  if (!commandMesh && !adaptiveFocusEnabled && !opsPlaybooks) {
    return (
      <Page header={t('Ops Command Center')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>
              Ops modules are disabled. Enable command mesh, adaptive focus, or playbooks in
              Settings &gt; Feature Flags.
            </Trans>
          </Text>
        </View>
      </Page>
    );
  }

  return (
    <Page header={t('Ops Command Center')}>
      <View
        style={{
          display: 'grid',
          gridTemplateColumns: '260px minmax(0, 1fr) 320px',
          gap: 12,
          alignItems: 'start',
          paddingBottom: 20,
        }}
      >
        <View
          style={{
            border: `1px solid ${theme.tableBorder}`,
            borderRadius: 8,
            backgroundColor: theme.tableBackground,
            padding: 12,
            gap: 10,
            position: 'sticky',
            top: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SvgDashboard width={15} height={15} />
            <Text style={{ fontWeight: 600 }}>{t('Command Rail')}</Text>
          </View>
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            {t('Keyboard-first operating loops. Build and execute chainable actions.')}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {loopShortcuts.map(loop => (
              <Button
                key={loop.id}
                variant="bare"
                style={{ fontSize: 11 }}
                onPress={() => navigate(loop.route)}
              >
                {t('{{label}} (Alt+{{key}})', { label: loop.label, key: loop.id })}
              </Button>
            ))}
          </View>

          {commandHints.map(hint => (
            <CommandHint
              key={hint.command}
              command={hint.command}
              description={hint.description}
              onRun={executeChain}
            />
          ))}

          <View style={{ borderTop: `1px solid ${theme.tableBorder}`, paddingTop: 10, gap: 6 }}>
            <Text style={{ fontSize: 11, textTransform: 'uppercase', color: theme.pageTextSubdued }}>
              {t('Operator')}
            </Text>
            <Input
              value={operatorName}
              onChangeValue={setOperatorName}
              placeholder={t('Delegate name')}
            />
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <View
            style={{
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 8,
              backgroundColor: theme.tableBackground,
              padding: 12,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <SvgQueue width={15} height={15} />
              <Text style={{ fontWeight: 600 }}>{t('Command Mesh')}</Text>
              <View style={{ flex: 1 }} />
              <Button variant="bare" onPress={() => refresh()}>
                <SvgRefresh width={14} height={14} />
              </Button>
            </View>
            <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
              {t('Compose command chains with "->" separators.')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Input
                value={commandInput}
                onChangeValue={setCommandInput}
                placeholder={t('triage -> expiring<30d -> batch-renegotiate')}
                style={{ flex: 1 }}
              />
              <Button
                variant="bare"
                onPress={() => setDryRunMode(current => !current)}
              >
                {dryRunMode ? t('Dry-run') : t('Live')}
              </Button>
              <Button
                isDisabled={executing || loading}
                onPress={() => executeChain(commandInput)}
              >
                {executing ? t('Running...') : t('Execute')}
              </Button>
            </View>

            {error ? (
              <Text style={{ color: theme.errorText }}>
                {t('Error loading ops data: {{error}}', { error })}
              </Text>
            ) : null}

            <View style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <MetricCard
                title={t('Pending Reviews')}
                value={String(moneyPulse?.pendingReviews ?? 0)}
                subtitle={t('Urgent: {{count}}', {
                  count: moneyPulse?.urgentReviews ?? 0,
                })}
              />
              <MetricCard
                title={t('Expiring Contracts')}
                value={String(moneyPulse?.expiringContracts ?? 0)}
                subtitle={t('Within 30-day window')}
              />
              <MetricCard
                title={t('Pulse Updated')}
                value={
                  moneyPulse?.generatedAtMs
                    ? new Date(moneyPulse.generatedAtMs).toLocaleTimeString()
                    : '--:--'
                }
                subtitle={t('Gateway telemetry')}
              />
            </View>
          </View>

          <View
            style={{
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 8,
              backgroundColor: theme.tableBackground,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ fontWeight: 600 }}>{t('Execution Timeline')}</Text>
            {commandLogs.length === 0 ? (
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                {t('No commands executed yet.')}
              </Text>
            ) : (
              commandLogs.map(log => (
                <View
                  key={log.id}
                  style={{
                    border: `1px solid ${theme.tableBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    backgroundColor: theme.menuAutoCompleteBackground,
                    gap: 4,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {log.status === 'ok' ? (
                      <SvgCheckmark width={13} height={13} />
                    ) : (
                      <SvgTimer width={13} height={13} />
                    )}
                    <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{log.step}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                    {log.detail}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <View
            style={{
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 8,
              backgroundColor: theme.tableBackground,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ fontWeight: 600 }}>{t('Adaptive Focus')}</Text>
            <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
              {t('Next-best actions ranked by urgency and confidence.')}
            </Text>
            {(adaptiveFocus?.actions ?? []).slice(0, 5).map(action => (
              <View
                key={action.id}
                style={{
                  border: `1px solid ${theme.tableBorder}`,
                  borderRadius: 6,
                  padding: 8,
                  gap: 4,
                }}
              >
                <Text style={{ fontSize: 13 }}>{String(action.title)}</Text>
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                  {t('Score: {{score}}', { score: Number(action.score || 0) })}
                </Text>
                <Button
                  variant="bare"
                  style={{ alignSelf: 'flex-start', fontSize: 12 }}
                  onPress={() => {
                    if (action.route) {
                      void navigate(String(action.route));
                    }
                  }}
                >
                  <Trans>Open</Trans>
                </Button>
              </View>
            ))}
          </View>

          <View
            style={{
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 8,
              backgroundColor: theme.tableBackground,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ fontWeight: 600 }}>{t('Playbooks')}</Text>
            {(playbooks ?? []).slice(0, 4).map(playbook => (
              <View
                key={String(playbook.id)}
                style={{
                  border: `1px solid ${theme.tableBorder}`,
                  borderRadius: 6,
                  padding: 8,
                  gap: 6,
                }}
              >
                <Text>{String(playbook.name || t('Unnamed playbook'))}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    variant="bare"
                    onPress={() => {
                      if (typeof playbook.id === 'string') {
                        void runPlaybook(playbook.id, true);
                      }
                    }}
                  >
                    <Trans>Dry run</Trans>
                  </Button>
                </View>
              </View>
            ))}
          </View>

          {delegateLanesEnabled && (
            <View
              style={{
                border: `1px solid ${theme.tableBorder}`,
                borderRadius: 8,
                backgroundColor: theme.tableBackground,
                padding: 12,
                gap: 8,
              }}
            >
              <Text style={{ fontWeight: 600 }}>{t('Delegate Lanes')}</Text>
              {(lanes ?? []).slice(0, 5).map(lane => (
                <View
                  key={String(lane.id)}
                  style={{
                    border: `1px solid ${theme.tableBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    gap: 2,
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{String(lane.title || t('Untitled lane'))}</Text>
                  <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                    {t('Status: {{status}}', { status: String(lane.status || 'assigned') })}
                  </Text>
                </View>
              ))}
              {lanes.length === 0 && (
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                  {t('No delegate lanes yet.')}
                </Text>
              )}
            </View>
          )}

          <View
            style={{
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 8,
              backgroundColor: theme.tableBackground,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ fontWeight: 600 }}>{t('Recent Command Runs')}</Text>
            {(commandRuns ?? []).slice(0, 5).map(run => (
              <View
                key={String(run.id)}
                style={{
                  border: `1px solid ${theme.tableBorder}`,
                  borderRadius: 6,
                  padding: 8,
                  gap: 4,
                }}
              >
                <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {String(run.chain || '')}
                </Text>
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                  {new Date(Number(run.executedAtMs || 0)).toLocaleTimeString()} ·{' '}
                  {String(run.actorId || 'owner')} · {String(run.sourceSurface || 'unknown')}{' '}
                  · {run.dryRun ? t('dry-run') : t('live')} ·{' '}
                  {t('Errors: {{count}}', { count: Number(run.errorCount || 0) })}
                </Text>
              </View>
            ))}
            {commandRuns.length === 0 && (
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                {t('No command runs yet.')}
              </Text>
            )}
          </View>

          {closeLoopEnabled && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button variant="bare" onPress={() => runCloseRoutine('weekly')}>
                <Trans>Run Weekly Close</Trans>
              </Button>
              <Button variant="bare" onPress={() => runCloseRoutine('monthly')}>
                <Trans>Run Monthly Close</Trans>
              </Button>
            </View>
          )}
        </View>
      </View>
    </Page>
  );
}
