import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as postArea } from '@/app/api/projects/[projectId]/areas/route';
import { POST as postSubarea } from '@/app/api/projects/[projectId]/areas/[areaId]/subareas/route';

test('legacy area write route returns 409 with migration guidance', async () => {
  const response = await postArea(
    new NextRequest('http://localhost/api/projects/project-1/areas', { method: 'POST' }),
    { params: Promise.resolve({ projectId: 'project-1' }) },
  );

  assert.equal(response.status, 409);
  const json = await response.json() as { error: { message: string } };
  assert.equal(json.error.message, 'Legacy area setup writes are retired; use the AOR setup surface');
});

test('legacy subarea write route returns 409 with migration guidance', async () => {
  const response = await postSubarea(
    new NextRequest('http://localhost/api/projects/project-1/areas/area-1/subareas', { method: 'POST' }),
    { params: Promise.resolve({ projectId: 'project-1', areaId: 'area-1' }) },
  );

  assert.equal(response.status, 409);
  const json = await response.json() as { error: { message: string } };
  assert.equal(json.error.message, 'Legacy subarea setup writes are retired; use the AOR setup surface');
});
