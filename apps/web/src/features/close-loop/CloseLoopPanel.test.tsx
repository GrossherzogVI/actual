import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CloseRun, MoneyPulse } from '../../core/types';

import { CloseLoopPanel } from './CloseLoopPanel';

const apiClientMock = vi.hoisted(() => ({
  listCloseRuns: vi.fn(),
  getMoneyPulse: vi.fn(),
  runCloseRoutine: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

function createCloseRun(overrides: Partial<CloseRun> = {}): CloseRun {
  return {
    id: 'close-run-1',
    period: 'weekly',
    exceptionCount: 0,
    summary: {
      pendingReviews: 2,
      urgentReviews: 0,
      expiringContracts: 1,
    },
    createdAtMs: Date.now(),
    ...overrides,
  };
}

function createMoneyPulse(overrides: Partial<MoneyPulse> = {}): MoneyPulse {
  return {
    pendingReviews: 3,
    urgentReviews: 1,
    expiringContracts: 2,
    generatedAtMs: Date.now(),
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
      <CloseLoopPanel onStatus={onStatus} />
    </QueryClientProvider>,
  );

  return { onStatus };
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('CloseLoopPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    apiClientMock.listCloseRuns.mockResolvedValue([]);
    apiClientMock.getMoneyPulse.mockResolvedValue(createMoneyPulse());
    apiClientMock.runCloseRoutine.mockResolvedValue(
      createCloseRun({ exceptionCount: 1 }),
    );
  });

  it('renders close confidence score and stage health cards', async () => {
    apiClientMock.listCloseRuns.mockResolvedValue([
      createCloseRun({ id: 'run-with-exceptions', exceptionCount: 2 }),
    ]);

    renderPanel();

    expect(
      await screen.findByText('Close confidence score'),
    ).toBeInTheDocument();
    expect(screen.getByText('Preflight pressure')).toBeInTheDocument();
    expect(screen.getByText('Execution freshness')).toBeInTheDocument();
    expect(screen.getByText('Exception resolution')).toBeInTheDocument();
    expect(screen.getByText('Operational confidence')).toBeInTheDocument();
  });

  it('executes weekly close and reports status', async () => {
    const { onStatus } = renderPanel();

    await screen.findByText('Close confidence score');

    fireEvent.click(
      screen.getByRole('button', { name: 'Run weekly close' }),
    );

    await waitFor(() => {
      expect(apiClientMock.runCloseRoutine).toHaveBeenCalledWith('weekly');
    });

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('weekly close completed'),
      );
    });
  });

  it('marks exception run as resolved and moves it back to unresolved', async () => {
    apiClientMock.listCloseRuns.mockResolvedValue([
      createCloseRun({ id: 'exception-run', exceptionCount: 3 }),
    ]);

    const { onStatus } = renderPanel();

    const markButtons = await screen.findAllByRole('button', {
      name: 'Mark resolved',
    });
    fireEvent.click(markButtons[0]!);

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('marked resolved'),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('No unresolved close exceptions.')).toBeInTheDocument();
    });

    const moveBackButtons = screen.getAllByRole('button', {
      name: 'Move to unresolved',
    });
    fireEvent.click(moveBackButtons[0]!);

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('moved back to unresolved'),
      );
    });
  });

  it('executes full close cycle', async () => {
    apiClientMock.runCloseRoutine
      .mockResolvedValueOnce(createCloseRun({ period: 'weekly', exceptionCount: 0 }))
      .mockResolvedValueOnce(createCloseRun({ period: 'monthly', exceptionCount: 1 }));

    const { onStatus } = renderPanel();

    await screen.findByText('Close confidence score');

    fireEvent.click(
      screen.getByRole('button', { name: 'Full cycle' }),
    );

    await waitFor(() => {
      expect(apiClientMock.runCloseRoutine).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('Full close cycle executed'),
      );
    });
  });
});
