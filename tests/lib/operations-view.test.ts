import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOperationsTickets, operationsPage, operationsServerPage } from '@/lib/operations-view';
import type { TicketRecord } from '@/lib/contracts';

test('operations filters combine search, Area, status and priority without changing the input', () => {
  const rows = [
    { id: 'a', aorNodeId: 'north', status: 'APPROVED', priority: 'HIGH', ticketNumber: 'SWR-1', description: 'Control layout', requesterName: 'Demo Requester' },
    { id: 'b', aorNodeId: 'south', status: 'SUBMITTED', priority: 'NORMAL', ticketNumber: 'SWR-2', description: 'Control check' },
  ] as TicketRecord[];
  assert.deepEqual(filterOperationsTickets(rows, ' control ', 'north', 'APPROVED', 'HIGH').map(r => r.id), ['a']);
  assert.deepEqual(filterOperationsTickets(rows, 'DEMO', '', '', '').map(r => r.id), ['a']);
  assert.equal(filterOperationsTickets(rows, '', 'south', 'APPROVED', '').length, 0);
  assert.equal(rows.length, 2);
});

test('operations pagination clamps after filtering and handles empty and last pages', () => {
  const rows = Array.from({ length: 26 }, (_, i) => i);
  assert.deepEqual(operationsPage(rows, 3, 10).items, [20,21,22,23,24,25]);
  assert.equal(operationsPage(rows, 9, 25).page, 2);
  assert.equal(operationsPage(rows, 1, 50).last, 26);
  assert.deepEqual(operationsPage([], 8, 10), { items: [], page: 1, pages: 1, total: 0, first: 0, last: 0 });
});

test('server page metadata uses the filtered total without downloading or slicing other pages', () => {
  assert.deepEqual(operationsServerPage(['last'], 21, 3, 10), { items: ['last'], total: 21, page: 3, pages: 3, first: 21, last: 21 });
  assert.equal(operationsServerPage([], 0, 1, 10).first, 0);
});
