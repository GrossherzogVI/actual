import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';
import type {
  WebhookConfig,
  WebhookDelivery,
  WebhookDeliveryStats,
  WebhookTestResult,
} from 'loot-core/server/webhooks/app';

import { Setting } from './UI';

import { Checkbox } from '@desktop-client/components/forms';
import { useServerURL } from '@desktop-client/components/ServerContext';
import { useSyncServerStatus } from '@desktop-client/hooks/useSyncServerStatus';

const EVENT_TYPES = [
  { value: 'sync', label: 'Sync events' },
  { value: 'file-upload', label: 'File uploads' },
  { value: 'file-delete', label: 'File deletions' },
] as const;

export function WebhookSettings() {
  const { t } = useTranslation();
  const serverURL = useServerURL();
  const serverStatus = useSyncServerStatus();

  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [stats, setStats] = useState<WebhookDeliveryStats | null>(null);
  const [showDeliveries, setShowDeliveries] = useState(false);

  // Form state
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [secretTouched, setSecretTouched] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<string[]>([
    'sync',
    'file-upload',
    'file-delete',
  ]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const result = await send('webhook-get-config');
      if (result && !('error' in result)) {
        setConfig(result);
        setUrl(result.url || '');
        setSecret(result.secret || '');
        setSecretTouched(false);
        setEnabled(result.enabled);
        if (result.events) {
          setEvents(
            result.events === '*'
              ? ['sync', 'file-upload', 'file-delete']
              : result.events.split(',').map(e => e.trim()),
          );
        }
      }
    } catch {
      // Server may not support webhooks yet
    }
    setLoading(false);
  }, []);

  const loadDeliveries = useCallback(async () => {
    try {
      const result = await send('webhook-get-deliveries', { limit: 20 });
      if (result && !('error' in result)) {
        setDeliveries(result.deliveries);
        setStats(result.stats);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (serverStatus === 'online') {
      void loadConfig();
    }
  }, [serverStatus, loadConfig]);

  useEffect(() => {
    if (showDeliveries && serverStatus === 'online') {
      void loadDeliveries();
    }
  }, [showDeliveries, serverStatus, loadDeliveries]);

  if (!serverURL || serverStatus !== 'online') {
    return null;
  }

  if (loading) {
    return (
      <Setting>
        <Text>
          <Trans>
            <strong>Webhooks</strong> — Loading configuration...
          </Trans>
        </Text>
      </Setting>
    );
  }

  const hasChanges =
    url !== (config?.url || '') ||
    (secretTouched && secret !== (config?.secret || '')) ||
    enabled !== (config?.enabled || false) ||
    events.sort().join(',') !==
      (config?.events === '*'
        ? 'file-delete,file-upload,sync'
        : (config?.events || 'file-delete,file-upload,sync')
            .split(',')
            .map(e => e.trim())
            .sort()
            .join(','));

  async function handleSave() {
    setSaving(true);
    setTestResult(null);
    const updates: Record<string, unknown> = {
      url,
      enabled,
      events: events.join(','),
    };
    if (secretTouched) {
      updates.secret = secret;
    }
    try {
      const result = await send('webhook-update-config', updates);
      if (!result || !('error' in result) || !result.error) {
        await loadConfig();
      }
    } catch {
      // ignore
    }
    setSaving(false);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await send('webhook-test', { url, secret: secretTouched ? secret : undefined });
      if (result && !('error' in result)) {
        setTestResult(result);
      } else if (result && 'error' in result) {
        setTestResult({
          success: false,
          statusCode: null,
          error: result.error,
          durationMs: 0,
        });
      }
    } catch {
      setTestResult({
        success: false,
        statusCode: null,
        error: t('Network error'),
        durationMs: 0,
      });
    }
    setTesting(false);
  }

  function handleEventToggle(eventType: string) {
    setEvents(prev =>
      prev.includes(eventType)
        ? prev.filter(e => e !== eventType)
        : [...prev, eventType],
    );
  }

  async function handleClearDeliveries() {
    await send('webhook-clear-deliveries');
    setDeliveries([]);
    setStats(null);
  }

  return (
    <Setting>
      <Text>
        <Trans>
          <strong>Webhooks</strong> send HTTP POST notifications to external
          services (like n8n, Zapier, or custom endpoints) when budget events
          occur.
        </Trans>
      </Text>

      {/* Enable toggle */}
      <View style={{ marginTop: 5 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Checkbox
            checked={enabled}
            onChange={() => setEnabled(!enabled)}
          />
          <Text style={{ fontWeight: 500 }}>
            <Trans>Enable webhooks</Trans>
          </Text>
        </label>
      </View>

      {/* URL input */}
      <View style={{ marginTop: 10, gap: 5 }}>
        <Text style={{ fontWeight: 500, fontSize: 13 }}>
          <Trans>Webhook URL</Trans>
        </Text>
        <Input
          value={url}
          onChangeValue={setUrl}
          placeholder="https://n8n.example.com/webhook/actual"
          style={{ width: '100%' }}
        />
      </View>

      {/* Secret input */}
      <View style={{ marginTop: 10, gap: 5 }}>
        <Text style={{ fontWeight: 500, fontSize: 13 }}>
          <Trans>Signing secret</Trans>
          <Text
            style={{
              fontWeight: 400,
              color: theme.pageTextSubdued,
              marginLeft: 5,
            }}
          >
            <Trans>(optional — used for HMAC-SHA256 signature)</Trans>
          </Text>
        </Text>
        <Input
          value={secretTouched ? secret : config?.secretSet ? '••••••••' : ''}
          onChangeValue={val => {
            setSecretTouched(true);
            setSecret(val);
          }}
          onFocus={() => {
            if (!secretTouched) {
              setSecretTouched(true);
              setSecret('');
            }
          }}
          placeholder={t('Enter signing secret')}
          style={{ width: '100%' }}
        />
        {config?.secretSet && !secretTouched && (
          <Text
            style={{
              fontSize: 12,
              color: theme.pageTextSubdued,
            }}
          >
            <Trans>A secret is configured. Click the field to change it.</Trans>
          </Text>
        )}
      </View>

      {/* Event type filters */}
      <View style={{ marginTop: 10, gap: 5 }}>
        <Text style={{ fontWeight: 500, fontSize: 13 }}>
          <Trans>Event types</Trans>
        </Text>
        <View style={{ gap: 3 }}>
          {EVENT_TYPES.map(({ value, label }) => (
            <label
              key={value}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Checkbox
                checked={events.includes(value)}
                onChange={() => handleEventToggle(value)}
              />
              <Text>{label}</Text>
            </label>
          ))}
        </View>
      </View>

      {/* Action buttons */}
      <View
        style={{
          marginTop: 15,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <ButtonWithLoading
          variant="primary"
          isLoading={saving}
          isDisabled={!hasChanges || saving}
          onPress={handleSave}
        >
          <Trans>Save</Trans>
        </ButtonWithLoading>

        <ButtonWithLoading
          variant="bare"
          isLoading={testing}
          isDisabled={!url || testing}
          onPress={handleTest}
        >
          <Trans>Test connection</Trans>
        </ButtonWithLoading>

        <Button
          variant="bare"
          onPress={() => setShowDeliveries(!showDeliveries)}
        >
          {showDeliveries ? (
            <Trans>Hide delivery log</Trans>
          ) : (
            <Trans>Show delivery log</Trans>
          )}
        </Button>
      </View>

      {/* Test result */}
      {testResult && (
        <View
          style={{
            marginTop: 10,
            padding: 8,
            borderRadius: 4,
            backgroundColor: testResult.success
              ? theme.noticeBackground
              : theme.errorBackground,
          }}
        >
          <Text
            style={{
              fontWeight: 600,
              color: testResult.success
                ? theme.noticeText
                : theme.errorText,
            }}
          >
            {testResult.success
              ? t('Test successful ({{status}}, {{ms}}ms)', {
                  status: testResult.statusCode,
                  ms: testResult.durationMs,
                })
              : t('Test failed: {{error}}', {
                  error: testResult.error,
                })}
          </Text>
        </View>
      )}

      {/* Delivery log */}
      {showDeliveries && (
        <View style={{ marginTop: 15 }}>
          {/* Stats summary */}
          {stats && stats.total24h > 0 && (
            <View
              style={{
                marginBottom: 10,
                padding: 8,
                borderRadius: 4,
                backgroundColor: theme.tableHeaderBackground,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: 500 }}>
                <Trans>
                  Last 24h: {{ total: stats.total24h }} deliveries ({{
                    success: stats.successful24h,
                  }}{' '}
                  successful, {{ failed: stats.failed24h }} failed)
                </Trans>
              </Text>
            </View>
          )}

          {/* Delivery list */}
          {deliveries.length === 0 ? (
            <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
              <Trans>No deliveries recorded yet.</Trans>
            </Text>
          ) : (
            <>
              <View
                style={{
                  maxHeight: 300,
                  overflow: 'auto',
                  borderRadius: 4,
                  border: `1px solid ${theme.tableBorder}`,
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        backgroundColor: theme.tableHeaderBackground,
                        position: 'sticky',
                        top: 0,
                      }}
                    >
                      <th style={thStyle}>
                        <Trans>Status</Trans>
                      </th>
                      <th style={thStyle}>
                        <Trans>Event</Trans>
                      </th>
                      <th style={thStyle}>
                        <Trans>Code</Trans>
                      </th>
                      <th style={thStyle}>
                        <Trans>Time</Trans>
                      </th>
                      <th style={thStyle}>
                        <Trans>Duration</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map(d => (
                      <tr
                        key={d.id}
                        style={{
                          borderBottom: `1px solid ${theme.tableBorder}`,
                        }}
                      >
                        <td style={tdStyle}>
                          <Text
                            style={{
                              color: d.success
                                ? theme.noticeText
                                : theme.errorText,
                              fontWeight: 600,
                            }}
                          >
                            {d.success ? '\u2713' : '\u2717'}
                          </Text>
                        </td>
                        <td style={tdStyle}>{d.eventType}</td>
                        <td style={tdStyle}>
                          {d.statusCode || d.error || '—'}
                        </td>
                        <td style={tdStyle}>
                          {formatTime(d.createdAt)}
                        </td>
                        <td style={tdStyle}>
                          {d.durationMs != null ? `${d.durationMs}ms` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </View>
              <View style={{ marginTop: 8, flexDirection: 'row' }}>
                <Button variant="bare" onPress={handleClearDeliveries}>
                  <Trans>Clear log</Trans>
                </Button>
              </View>
            </>
          )}
        </View>
      )}
    </Setting>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '4px 8px',
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
