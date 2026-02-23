// @ts-strict-ignore
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheckmark,
  SvgDashboard,
  SvgQueue,
  SvgRefresh,
  SvgTimer,
} from '@actual-app/components/icons/v1';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useOpsCommandCenter } from './hooks/useOpsCommandCenter';

import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <Card className="p-3">
      <CardContent className="space-y-1.5 p-0">
        <code className="text-xs">{command}</code>
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
      </CardContent>
    </Card>
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
    <Card>
      <CardContent className="p-3 space-y-1">
        <Text
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            color: theme.pageTextSubdued,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: 22, fontWeight: 600 }}>{value}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            {subtitle}
          </Text>
        ) : null}
      </CardContent>
    </Card>
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
        description: t(
          'Loads next high-impact action and opens the target surface.',
        ),
      },
      {
        command: 'close -> weekly',
        description: t(
          'Runs weekly close routine and refreshes exception pressure.',
        ),
      },
      {
        command: 'playbook -> create-default -> run-first',
        description: t('Creates a baseline playbook and executes a dry run.'),
      },
      {
        command: 'expiring<30d -> batch-renegotiate',
        description: t(
          'Jumps to expiring contracts and creates delegate mission lane.',
        ),
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
              Ops modules are disabled. Enable command mesh, adaptive focus, or
              playbooks in Settings &gt; Feature Flags.
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
        <Card style={{ position: 'sticky', top: 10 }}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <SvgDashboard width={15} height={15} />
              {t('Command Rail')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
              {t(
                'Keyboard-first operating loops. Build and execute chainable actions.',
              )}
            </Text>

            <div className="flex flex-wrap gap-1.5">
              {loopShortcuts.map(loop => (
                <Badge
                  key={loop.id}
                  variant="secondary"
                  className="cursor-pointer text-[11px]"
                  onClick={() => navigate(loop.route)}
                >
                  {t('{{label}} (Alt+{{key}})', {
                    label: loop.label,
                    key: loop.id,
                  })}
                </Badge>
              ))}
            </div>

            {commandHints.map(hint => (
              <CommandHint
                key={hint.command}
                command={hint.command}
                description={hint.description}
                onRun={executeChain}
              />
            ))}

            <div className="border-t pt-2.5 space-y-1.5">
              <Text
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  color: theme.pageTextSubdued,
                }}
              >
                <Trans>Operator</Trans>
              </Text>
              <Input
                value={operatorName}
                onChangeValue={setOperatorName}
                placeholder={t('Delegate name')}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <SvgQueue width={15} height={15} />
                {t('Command Mesh')}
                <span className="flex-1" />
                <Button variant="bare" onPress={() => refresh()}>
                  <SvgRefresh width={14} height={14} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
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

              <div className="grid grid-cols-3 gap-2">
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('Execution Timeline')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {commandLogs.length === 0 ? (
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                  <Trans>No commands executed yet.</Trans>
                </Text>
              ) : (
                commandLogs.map(log => (
                  <Card key={log.id} className="p-2">
                    <CardContent className="p-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        {log.status === 'ok' ? (
                          <SvgCheckmark width={13} height={13} />
                        ) : (
                          <SvgTimer width={13} height={13} />
                        )}
                        <code className="text-xs">{log.step}</code>
                        <Badge
                          variant={log.status === 'ok' ? 'secondary' : 'destructive'}
                          className="ml-auto text-[10px] px-1.5 py-0"
                        >
                          {log.status}
                        </Badge>
                      </div>
                      <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                        {log.detail}
                      </Text>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('Adaptive Focus')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                {t('Next-best actions ranked by urgency and confidence.')}
              </Text>
              {(adaptiveFocus?.actions ?? []).slice(0, 5).map(action => (
                <Card key={action.id} className="p-2">
                  <CardContent className="p-0 space-y-1">
                    <Text style={{ fontSize: 13 }}>{String(action.title)}</Text>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {t('Score: {{score}}', { score: Number(action.score || 0) })}
                      </Badge>
                      <Button
                        variant="bare"
                        style={{ fontSize: 12 }}
                        onPress={() => {
                          if (action.route) {
                            void navigate(String(action.route));
                          }
                        }}
                      >
                        <Trans>Open</Trans>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm"><Trans>Playbooks</Trans></CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(playbooks ?? []).slice(0, 4).map(playbook => (
                <Card key={String(playbook.id)} className="p-2">
                  <CardContent className="p-0 space-y-1.5">
                    <Text>{String(playbook.name || t('Unnamed playbook'))}</Text>
                    <Button
                      variant="bare"
                      style={{ fontSize: 12 }}
                      onPress={() => {
                        if (typeof playbook.id === 'string') {
                          void runPlaybook(playbook.id, true);
                        }
                      }}
                    >
                      <Trans>Dry run</Trans>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          {delegateLanesEnabled && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('Delegate Lanes')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(lanes ?? []).slice(0, 5).map(lane => (
                  <Card key={String(lane.id)} className="p-2">
                    <CardContent className="p-0 space-y-0.5">
                      <Text style={{ fontSize: 13 }}>
                        {String(lane.title || t('Untitled lane'))}
                      </Text>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                          {String(lane.status || 'assigned')}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {lanes.length === 0 && (
                  <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                    <Trans>No delegate lanes yet.</Trans>
                  </Text>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('Recent Command Runs')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(commandRuns ?? []).slice(0, 5).map(run => (
                <Card key={String(run.id)} className="p-2">
                  <CardContent className="p-0 space-y-1">
                    <code className="text-xs">{String(run.chain || '')}</code>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={run.dryRun ? 'secondary' : 'default'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {run.dryRun ? t('dry-run') : t('live')}
                      </Badge>
                      {Number(run.errorCount || 0) > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {t('Errors: {{count}}', {
                            count: Number(run.errorCount || 0),
                          })}
                        </Badge>
                      )}
                    </div>
                    <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                      {new Date(Number(run.executedAtMs || 0)).toLocaleTimeString()}{' '}
                      · {String(run.actorId || 'owner')} ·{' '}
                      {String(run.sourceSurface || 'unknown')}
                    </Text>
                  </CardContent>
                </Card>
              ))}
              {commandRuns.length === 0 && (
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                  <Trans>No command runs yet.</Trans>
                </Text>
              )}
            </CardContent>
          </Card>

          {closeLoopEnabled && (
            <div className="flex gap-2">
              <Button variant="bare" onPress={() => runCloseRoutine('weekly')}>
                <Trans>Run Weekly Close</Trans>
              </Button>
              <Button variant="bare" onPress={() => runCloseRoutine('monthly')}>
                <Trans>Run Monthly Close</Trans>
              </Button>
            </div>
          )}
        </div>
      </View>
    </Page>
  );
}
