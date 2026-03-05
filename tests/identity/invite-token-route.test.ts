import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  handleGetInviteToken,
  type InviteTokenRouteDeps,
} from '@/app/api/auth/invite/[token]/handler';

const validNow = new Date('2026-03-04T12:00:00Z').getTime();

function makeRequest(token: string): NextRequest {
  return new NextRequest(`http://localhost/api/auth/invite/${token}`, {
    method: 'GET',
  });
}

function makeDeps(overrides?: Partial<InviteTokenRouteDeps>): InviteTokenRouteDeps {
  return {
    queryInvite: async () => ({
      tenant_id: 'tenant-1',
      project_id: 'project-1',
      email: 'field.user@example.com',
      role: 'REQUESTER',
      expires_at: new Date('2026-03-05T12:00:00Z'),
    }),
    now: () => validNow,
    ...overrides,
  };
}

test('handleGetInviteToken returns invite details for an active token', async () => {
  const response = await handleGetInviteToken(
    makeRequest('valid-token'),
    { params: Promise.resolve({ token: 'valid-token' }) },
    makeDeps(),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as {
    invite: {
      tenantId: string;
      projectId: string;
      email: string;
      role: string;
      expiresAt: string;
    };
  };
  assert.equal(json.invite.tenantId, 'tenant-1');
  assert.equal(json.invite.projectId, 'project-1');
  assert.equal(json.invite.email, 'field.user@example.com');
  assert.equal(json.invite.role, 'REQUESTER');
  assert.equal(json.invite.expiresAt, '2026-03-05T12:00:00.000Z');
});

test('handleGetInviteToken returns 404 when token is invalid', async () => {
  const response = await handleGetInviteToken(
    makeRequest('missing-token'),
    { params: Promise.resolve({ token: 'missing-token' }) },
    makeDeps({
      queryInvite: async () => null,
    }),
  );

  assert.equal(response.status, 404);
});

test('handleGetInviteToken returns 409 when token is expired', async () => {
  const response = await handleGetInviteToken(
    makeRequest('expired-token'),
    { params: Promise.resolve({ token: 'expired-token' }) },
    makeDeps({
      queryInvite: async () => ({
        tenant_id: 'tenant-1',
        project_id: 'project-1',
        email: 'field.user@example.com',
        role: 'REQUESTER',
        expires_at: new Date('2026-03-04T11:59:59Z'),
      }),
    }),
  );

  assert.equal(response.status, 409);
});
