import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { withTransaction } from '@/lib/with-transaction';
/**
 * PATCH /api/project-templates/[templateId]
 * DELETE /api/project-templates/[templateId]
 * Both require TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, ForbiddenError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { getTenantRole } from '@/lib/get-tenant-role';
import {
  reviewProjectTemplate,
  deleteProjectTemplate,
  updateProjectTemplate,
} from '@/modules/tenancy/application/project-templates';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { CrewBuild } from '@/modules/tenancy/domain/types';
import type { UUID } from '@/shared/types';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

const VALID_CREW_BUILDS: CrewBuild[] = ['FULL', 'MEDIUM', 'SLIM'];


function reviewedSnapshot(body: Record<string, unknown>): string {
  if (body.confirmed !== true || typeof body.expectedSnapshot !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedSnapshot)) {
    throw new ValidationError('Review the current shared template and confirm this catalog change.');
  }
  return body.expectedSnapshot;
}

export async function GET(req: NextRequest, {params}: {params: Promise<{templateId: string}>}) {
  try {
    const auth = await requireAuth(req), {templateId} = await params;
    requireResourceUuid(templateId, 'templateId');
    const review = await withTransaction(async client => {
      await coordinateAuthenticatedMutation(client, req, auth, 'SHARED', requireAuth);
      const actorRole = await getTenantRole(client, auth.tenantId, auth.userId, auth.sessionVersion);
      return reviewProjectTemplate(new TenancyRepository(), client, {tenantId: auth.tenantId, templateId: templateId as UUID, actorRole});
    });
    return NextResponse.json({review}, {headers: {'Cache-Control': 'private, no-store'}});
  } catch (err) { return errorResponse(err); }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { templateId } = await params;
    requireResourceUuid(templateId, 'templateId');
    const body = await req.json() as Record<string, unknown>;
    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.name !== 'string' ||
      typeof body.crewBuild !== 'string' ||
      !VALID_CREW_BUILDS.includes(body.crewBuild as CrewBuild) ||
      typeof body.aorDepth !== 'number' ||
      !Array.isArray(body.aorLevelLabels) ||
      !body.aorLevelLabels.every((label) => typeof label === 'string') ||
      !Array.isArray(body.disciplineGroups) ||
      !body.disciplineGroups.every((group) => typeof group === 'string')
    ) {
      throw new ValidationError(
        'name, crewBuild, aorDepth, aorLevelLabels[], and disciplineGroups[] are required',
      );
    }

    if (body.expectedSnapshot !== undefined) { reviewedSnapshot(body); requireIdempotencyKey(req); }
    const template = await withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', requireAuth);
      const actorRole = await getTenantRole(client, auth.tenantId, auth.userId, auth.sessionVersion);
      if (actorRole !== 'TENANT_ADMIN') throw new ForbiddenError('Only Central IT can manage shared project templates');
      const repo = new TenancyRepository();
      const update = async () => {
      if (body.expectedSnapshot !== undefined) {
        const review = await reviewProjectTemplate(repo, client, {tenantId: auth.tenantId, templateId: templateId as UUID, actorRole});
        if (review.snapshot !== reviewedSnapshot(body)) throw new ConflictError('This template changed. Reload Templates and review it again.');
      }
      const template = await updateProjectTemplate(repo, client, {
      tenantId: auth.tenantId,
      templateId: templateId as UUID,
      actorRole,
      name: body.name as string,
      crewBuild: body.crewBuild as CrewBuild,
      aorDepth: body.aorDepth as number,
      aorLevelLabels: body.aorLevelLabels as string[],
      disciplineGroups: body.disciplineGroups as string[],
    });

      await appendAdministrativeEvent(client, {
        auth, projectId: null, subjectUserId: null,
        eventType: 'tenant.template_updated', authorityEvidence: { actorRole },
        changes: { result: template },
      });
      return template;
      };
      if (req.headers.has('Idempotency-Key')) {
        if (body.expectedSnapshot !== undefined) reviewedSnapshot(body);
        const result = await executeIdempotentHttpMutation(client, {tenantId: auth.tenantId, actorId: auth.userId,
          endpoint: `PATCH /api/project-templates/${templateId}`, idempotencyKey: requireIdempotencyKey(req)}, body,
          async () => ({status: 200, body: {template: await update()}}));
        return result.body.template;
      }
      return update();
    });
    return NextResponse.json({ template });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { templateId } = await params;
    requireResourceUuid(templateId, 'templateId');
    const keyed = req.headers.has('Idempotency-Key');
    const raw = await req.text();
    const parsed = raw.trim() ? JSON.parse(raw) as Record<string, unknown> : {};
    const body = keyed || parsed?.expectedSnapshot !== undefined ? parsed : null;
    if (keyed && (!body || typeof body !== 'object' || Array.isArray(body))) throw new ValidationError('Confirm a reviewed template deletion.');
    if (body?.expectedSnapshot !== undefined) { reviewedSnapshot(body); requireIdempotencyKey(req); }
    await withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', requireAuth);
      const actorRole = await getTenantRole(client, auth.tenantId, auth.userId, auth.sessionVersion);
      if (actorRole !== 'TENANT_ADMIN') throw new ForbiddenError('Only Central IT can manage shared project templates');
      const repo = new TenancyRepository();
      const remove = async () => {
      if (body?.expectedSnapshot !== undefined) {
        const review = await reviewProjectTemplate(repo, client, {tenantId: auth.tenantId, templateId: templateId as UUID, actorRole});
        if (review.snapshot !== reviewedSnapshot(body)) throw new ConflictError('This template changed. Reload Templates and review it again.');
      }
      await deleteProjectTemplate(repo, client, {
      tenantId: auth.tenantId,
      templateId: templateId as UUID,
      actorRole,
    });
      await appendAdministrativeEvent(client, {
        auth, projectId: null, subjectUserId: null,
        eventType: 'tenant.template_deleted', authorityEvidence: { actorRole },
        changes: { templateId },
      });
      return {success: true};
      };
      if (body) {
        await executeIdempotentHttpMutation(client, {tenantId: auth.tenantId, actorId: auth.userId,
          endpoint: `DELETE /api/project-templates/${templateId}`, idempotencyKey: requireIdempotencyKey(req)}, body,
          async () => ({status: 200, body: await remove()}));
      } else await remove();
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
