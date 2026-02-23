import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OpsActivityEvent, OpsActivityListResult } from '../../core/types';

import { OpsActivityFeedPanel } from './OpsActivityFeedPanel';

const apiClientMock = vi.hoisted(() => ({
  listOpsActivity: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

function createEvent(
  overrides: Partial<OpsActivityEvent> = {},
): OpsActivityEvent {
  return {
    id: 'event-1',
    kind: 'workflow-command-run',
    title: 'Command run completed',
    detail: 'triage -> close-weekly executed.',
    route: '/ops#command-mesh',
    severity: 'info',
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
  const onRoute = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <OpsActivityFeedPanel onRoute={onRoute} />
    </QueryClientProvider>,
  );

  return { onRoute };
}

describe('OpsActivityFeedPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.listOpsActivity.mockResolvedValue({
      events: [
        createEvent({ id: 'e1', title: 'Command run completed', severity: 'info' }),
        createEvent({
          id: 'e2',
          kind: 'workflow-close-run',
          title: 'Weekly close finished',
          severity: 'warn',
        }),
      ],
      nextCursor: undefined,
    } satisfies OpsActivityListResult);
  });

  it('renders activity events and filter buttons', async () => {
    renderPanel();

    expect(
      await screen.findByText('Ops Activity Feed'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Command run completed'),
    ).toBeInTheDocument();
    expect(screen.getByText('Weekly close finished')).toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: 'All' }).length).toBe(2);
    expect(screen.getByRole('button', { name: 'Commands' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Critical' })).toBeInTheDocument();
  });

  it('filters events by kind when clicking a filter button', async () => {
    renderPanel();

    await screen.findByText('Command run completed');

    fireEvent.click(screen.getByRole('button', { name: 'Commands' }));

    await waitFor(() => {
      expect(apiClientMock.listOpsActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          kinds: ['workflow-command-run'],
        }),
      );
    });
  });

  it('filters events by severity', async () => {
    renderPanel();

    await screen.findByText('Command run completed');

    fireEvent.click(screen.getByRole('button', { name: 'Warnings' }));

    await waitFor(() => {
      expect(apiClientMock.listOpsActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          severities: ['warn'],
        }),
      );
    });
  });

  it('navigates to event route when Open button is clicked', async () => {
    const { onRoute } = renderPanel();

    const openButtons = await screen.findAllByRole('button', { name: 'Open' });
    fireEvent.click(openButtons[0]!);

    expect(onRoute).toHaveBeenCalledWith('/ops#command-mesh');
  });

  it('renders load more button when next page is available', async () => {
    apiClientMock.listOpsActivity
      .mockResolvedValueOnce({
        events: [createEvent({ id: 'page1' })],
        nextCursor: 'cursor-2',
      } satisfies OpsActivityListResult)
      .mockResolvedValueOnce({
        events: [
          createEvent({ id: 'page2', title: 'Second page event' }),
        ],
        nextCursor: undefined,
      } satisfies OpsActivityListResult);

    renderPanel();

    const loadMore = await screen.findByRole('button', { name: 'Load More' });
    fireEvent.click(loadMore);

    await waitFor(() => {
      expect(apiClientMock.listOpsActivity).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'cursor-2' }),
      );
    });
  });
});
