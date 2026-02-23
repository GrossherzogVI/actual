import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EgressAuditEntry, EgressPolicy } from '../../core/types';

import { PolicyControlPanel } from './PolicyControlPanel';

const apiClientMock = vi.hoisted(() => ({
  getEgressPolicy: vi.fn(),
  setEgressPolicy: vi.fn(),
  listEgressAudit: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

function createPolicy(
  overrides: Partial<EgressPolicy> = {},
): EgressPolicy {
  return {
    allowCloud: false,
    allowedProviders: [],
    redactionMode: 'strict',
    ...overrides,
  };
}

function createAuditEntry(
  overrides: Partial<EgressAuditEntry> = {},
): EgressAuditEntry {
  return {
    id: 'audit-1',
    eventType: 'policy-saved',
    provider: 'local-policy',
    payload: { redactionMode: 'strict' },
    createdAtMs: Date.now(),
    ...overrides,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onStatus = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <PolicyControlPanel onStatus={onStatus} />
    </QueryClientProvider>,
  );

  return { onStatus };
}

describe('PolicyControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.getEgressPolicy.mockResolvedValue(createPolicy());
    apiClientMock.listEgressAudit.mockResolvedValue([
      createAuditEntry({ id: 'a1', eventType: 'policy-saved' }),
    ]);
    apiClientMock.setEgressPolicy.mockResolvedValue(
      createPolicy({ allowCloud: true, redactionMode: 'balanced' }),
    );
  });

  it('renders policy controls and audit timeline', async () => {
    renderPanel();

    expect(await screen.findByText('Policy Plane')).toBeInTheDocument();
    expect(screen.getByText('Allow cloud model egress')).toBeInTheDocument();
    expect(screen.getByText('Egress audit timeline')).toBeInTheDocument();
    expect(await screen.findByText('policy-saved')).toBeInTheDocument();
  });

  it('toggles cloud egress and saves policy', async () => {
    const { onStatus } = renderPanel();

    await screen.findByText('policy-saved');

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => {
      expect(apiClientMock.setEgressPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          allowCloud: true,
          redactionMode: 'strict',
        }),
      );
    });

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('Policy updated'),
      );
    });
  });

  it('updates allowed providers and saves policy', async () => {
    const { onStatus } = renderPanel();

    await screen.findByText('policy-saved');

    const providerInput = screen.getByPlaceholderText('openai, anthropic');
    fireEvent.change(providerInput, {
      target: { value: 'openai, anthropic' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => {
      expect(apiClientMock.setEgressPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedProviders: ['openai', 'anthropic'],
        }),
      );
    });

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('Policy updated'),
      );
    });
  });

  it('loads existing policy into controls on mount', async () => {
    apiClientMock.getEgressPolicy.mockResolvedValue(
      createPolicy({
        allowCloud: true,
        allowedProviders: ['anthropic'],
        redactionMode: 'balanced',
      }),
    );

    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    expect(screen.getByPlaceholderText('openai, anthropic')).toHaveValue(
      'anthropic',
    );
  });
});
