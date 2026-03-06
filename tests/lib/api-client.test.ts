import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError } from '@/lib/errors';

const originalFetch = globalThis.fetch;

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

test('apiClient forwards method/body/query and parses success payloads', { concurrency: false }, async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ data: [], total: 0, limit: 20, offset: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await apiClient.listTickets('project-1', 20, 0);

    assert.equal(capturedUrl, '/api/tickets?projectId=project-1&limit=20&offset=0');
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(capturedInit?.credentials, 'include');
    assert.equal(capturedInit?.cache, 'no-store');
    assert.equal(result.total, 0);
  } finally {
    restoreFetch();
  }
});

test('apiClient adds Idempotency-Key headers for idempotent ticket mutations', { concurrency: false }, async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ ticket: { id: 'ticket-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await apiClient.createTicket({
      projectId: 'project-1',
      aorNodeId: 'aor-1',
      ticketType: 'LAYOUT',
      craft: 'Survey',
      fieldContact: 'Crew Lead',
      fieldChannel: 'CH-1',
      description: 'Need a layout',
      requestedDate: '2026-03-05T00:00:00.000Z',
    });
    await apiClient.requesterCancel('ticket-1');

    assert.equal(requests.length, 2);
    for (const request of requests) {
      const headers = new Headers(request.init?.headers);
      const key = headers.get('Idempotency-Key');
      assert.equal(typeof key, 'string');
      assert.notEqual(key, '');
    }
  } finally {
    restoreFetch();
  }
});

test('apiClient throws typed ApiClientError when backend returns api error payload', { concurrency: false }, async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          type: 'ForbiddenError',
          message: 'Access denied',
        },
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' },
      },
    )) as typeof fetch;

  try {
    await assert.rejects(
      () => apiClient.listAorTree('project-1'),
      (error) => {
        assert(error instanceof ApiClientError);
        assert.equal(error.type, 'ForbiddenError');
        assert.equal(error.message, 'Access denied');
        assert.equal(error.status, 403);
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});

test('apiClient throws InternalError with trimmed plain-text message for non-json error bodies', { concurrency: false }, async () => {
  globalThis.fetch = (async () =>
    new Response('  upstream timeout  ', {
      status: 504,
      headers: { 'content-type': 'text/plain' },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () => apiClient.getTicket('ticket-1'),
      (error) => {
        assert(error instanceof ApiClientError);
        assert.equal(error.type, 'InternalError');
        assert.equal(error.message, 'upstream timeout');
        assert.equal(error.status, 504);
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});

test('apiClient throws status fallback message when error response has an empty body', { concurrency: false }, async () => {
  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;

  try {
    await assert.rejects(
      () => apiClient.validateInvite('token-1'),
      (error) => {
        assert(error instanceof ApiClientError);
        assert.equal(error.type, 'InternalError');
        assert.equal(error.message, 'Request failed with status 500');
        assert.equal(error.status, 500);
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});
