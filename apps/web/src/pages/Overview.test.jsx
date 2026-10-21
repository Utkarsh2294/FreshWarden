import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import Overview from './Overview.jsx';
import { initials } from '../lib/display.js';
afterEach(cleanup);
const data = (count) => ({
  store: { name: 'Test', zones: [] },
  productCount: 1234567,
  lots: Array.from({ length: count }, (_, i) => ({
    _id: String(i),
    qty: 1,
    status: 'accepted',
    productId: { name: `Product ${i}` },
    effectiveExpDate: '2020-01-01',
  })),
});
it('shows expired accepted stock as blocked and paginates large lists', () => {
  const view = render(<Overview data={data(1000)} onNavigate={() => {}} />);
  expect(screen.getAllByText('Expiry blocked')).toHaveLength(25);
  expect(view.container.querySelectorAll('tbody tr')).toHaveLength(25);
  expect(screen.getByText('12,34,567')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('26–50 of 1,000')).toBeTruthy();
  expect(screen.getByText('Product 25')).toBeTruthy();
});
it('handles an empty watchlist and grapheme initials', () => {
  render(<Overview data={data(0)} onNavigate={() => {}} />);
  expect(screen.getByText('No flagged lots')).toBeTruthy();
  expect(initials('👩🏽‍💻 Priya')).toBe('👩🏽‍💻P');
  expect(initials('  Sam   Lee ')).toBe('SL');
  expect(initials('')).toBe('FW');
});
