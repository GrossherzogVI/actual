import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DelegateLane } from '../../core/types';

import { DelegateLanesPanel } from './DelegateLanesPanel';

const apiClientMock = vi.hoisted(() => ({
  listDelegateLanes: vi.fn(),
  listDelegateLaneEvents: vi.fn(),
  assignDelegateLane: vi.fn(),
  acceptDelegateLane: vi.fn(),
  completeDelegateLane: vi.fn(),
  rejectDelegateLane: vi.fn(),
  reopenDelegateLane: vi.fn(),
  commentDelegateLane: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

function createLane(overrides: Partial<DelegateLane> = {}): DelegateLane {
  const now = Date.now();
  return {
    id: 'lane-1',
    title: 'Renegotiate ISP contract',
    priority: 'high',
    status: 'assigned',
    assignee: 'delegate',
    assignedBy: 'owner',
    payload: {},
    createdAtMs: now,
    updatedAtMs: now,
    dueAtMs: now + 2 * 24 * 60 * 60 * 1000,
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
      <DelegateLanesPanel onStatus={onStatus} />
    </QueryClientProvider>,
  );

  return { onStatus };
}

describe('DelegateLanesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.listDelegateLanes.mockResolvedValue([]);
    apiClientMock.listDelegateLaneEvents.mockResolvedValue([]);
    apiClientMock.assignDelegateLane.mockResolvedValue(
      createLane({ id: 'new-lane', title: 'New mission' }),
    );
    apiClientMock.acceptDelegateLane.mockResolvedValue(
      createLane({ status: 'accepted' }),
    );
    apiClientMock.completeDelegateLane.mockResolvedValue(
      createLane({ status: 'completed' }),
    );
    apiClientMock.rejectDelegateLane.mockResolvedValue(
      createLane({ status: 'rejected' }),
    );
    apiClientMock.reopenDelegateLane.mockResolvedValue(
      createLane({ status: 'assigned' }),
    );
    apiClientMock.commentDelegateLane.mockResolvedValue({
      id: 'event-1',
      laneId: 'lane-1',
      type: 'comment',
      actorId: 'owner',
      message: 'Test note',
      createdAtMs: Date.now(),
    });
  });

  it('renders mission metrics and assigns a new lane', async () => {
    apiClientMock.listDelegateLanes.mockResolvedValue([
      createLane({ id: 'lane-assigned', status: 'assigned' }),
      createLane({ id: 'lane-accepted', status: 'accepted' }),
    ]);

    const { onStatus } = renderPanel();

    await screen.findByText('Delegate Mission Lanes');

    expect(
      (await screen.findAllByText('Renegotiate ISP contract')).length,
    ).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText('Mission title'), {
      target: { value: 'New mission' },
    });
    fireEvent.change(screen.getByPlaceholderText('Assignee'), {
      target: { value: 'delegate' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Assign lane' }));

    await waitFor(() => {
      expect(apiClientMock.assignDelegateLane).toHaveBeenCalledWith(
        'New mission',
        'delegate',
        expect.objectContaining({ priority: 'normal' }),
      );
    });

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('Assigned lane'),
      );
    });
  });

  it('transitions lane from assigned to accepted', async () => {
    apiClientMock.listDelegateLanes.mockResolvedValue([
      createLane({ id: 'lane-to-accept', status: 'assigned' }),
    ]);

    const { onStatus } = renderPanel();

    const acceptButtons = await screen.findAllByRole('button', {
      name: 'Accept',
    });
    fireEvent.click(acceptButtons[0]!);

    await waitFor(() => {
      expect(apiClientMock.acceptDelegateLane).toHaveBeenCalledWith(
        'lane-to-accept',
      );
    });

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('accepted'),
      );
    });
  });

  it('selects lanes and executes batch accept', async () => {
    apiClientMock.listDelegateLanes.mockResolvedValue([
      createLane({ id: 'lane-a', title: 'Lane A', status: 'assigned' }),
      createLane({ id: 'lane-b', title: 'Lane B', status: 'assigned' }),
    ]);

    const { onStatus } = renderPanel();

    await screen.findAllByText('Lane A');

    fireEvent.click(
      screen.getByRole('button', { name: 'Select all visible' }),
    );

    await waitFor(() => {
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Batch accept/ }),
    );

    await waitFor(() => {
      expect(apiClientMock.acceptDelegateLane).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('Accept batch'),
      );
    });
  });
});
