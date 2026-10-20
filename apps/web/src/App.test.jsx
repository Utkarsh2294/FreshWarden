import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App.jsx';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('shows API state from the server', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ status: 'ok' }) })); render(<QueryClientProvider client={new QueryClient()}><App /></QueryClientProvider>); expect(await screen.findByText('API: ok')).toBeTruthy(); });
