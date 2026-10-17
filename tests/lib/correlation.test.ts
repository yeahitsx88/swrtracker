import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { withRequestCorrelation } from '@/lib/correlation';

test('withRequestCorrelation preserves provided x-correlation-id across response header and error payload', async () => {
  const request = new NextRequest('http://localhost/api/tickets', {
    method: 'POST',
    headers: { 'x-correlation-id': 'corr-provided-123' },
  });

  const response = await withRequestCorrelation(
    request,
    async () => errorResponse(new ValidationError('bad request')),
  );

  assert.equal(response.headers.get('x-correlation-id'), 'corr-provided-123');
  const json = await response.json() as { error: { correlationId: string } };
  assert.equal(json.error.correlationId, 'corr-provided-123');
});

test('withRequestCorrelation generates x-correlation-id when request header is missing', async () => {
  const request = new NextRequest('http://localhost/api/tickets', {
    method: 'GET',
  });

  const response = await withRequestCorrelation(
    request,
    async () => NextResponse.json({ ok: true }),
  );

  const correlationId = response.headers.get('x-correlation-id');
  assert.ok(correlationId);
  assert.match(correlationId ?? '', /^[0-9a-f-]{36}$/);
});

test('errorResponse uses generated request correlation id for structured errors', async () => {
  const request = new NextRequest('http://localhost/api/tickets', {
    method: 'GET',
  });

  const response = await withRequestCorrelation(
    request,
    async () => errorResponse(new ValidationError('projectId query parameter is required')),
  );

  const headerCorrelationId = response.headers.get('x-correlation-id');
  const json = await response.json() as { error: { correlationId: string } };
  assert.equal(json.error.correlationId, headerCorrelationId);
});
