import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import './i18n.js';
import App from './App.jsx';
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
const renderApp = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
it('unauthenticated user sees sign-in', () => {
  renderApp();
  expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeTruthy();
  expect(screen.getByLabelText('Phone number')).toBeTruthy();
});
it('failed login preserves form and explains failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: 'Phone or password is incorrect.' },
      }),
    }),
  );
  renderApp();
  fireEvent.change(screen.getByLabelText('Phone number'), {
    target: { value: '9000000001' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'wrong-password' },
  });
  fireEvent.submit(screen.getByLabelText('Password').closest('form'));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Phone or password is incorrect.',
  );
});
