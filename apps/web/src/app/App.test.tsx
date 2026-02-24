import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App';

vi.mock('../features/finance/FinancePage', () => ({
  FinancePage: () => <div data-testid="finance-page">Finance Page</div>,
}));

vi.mock('../features/quick-add', () => ({
  QuickAddOverlay: ({ open }: { open: boolean }) =>
    open ? <div data-testid="quick-add-overlay">Quick Add</div> : null,
}));

vi.mock('./CommandPalette', () => ({
  CommandPalette: ({ open }: { open: boolean }) =>
    open ? <div data-testid="command-palette">Command Palette</div> : null,
}));

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('renders Finance OS header and FinancePage', () => {
    renderApp();
    expect(screen.getByText('Finance OS')).toBeInTheDocument();
    expect(screen.getByTestId('finance-page')).toBeInTheDocument();
  });

  it('opens command palette with Cmd+K', () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
  });

  it('opens quick add with Cmd+N', () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(screen.getByTestId('quick-add-overlay')).toBeInTheDocument();
  });
});
