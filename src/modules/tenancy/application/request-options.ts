import { NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

export interface RequestOptions {
  project: { id: UUID; name: string };
  ownDepartmentId: UUID | null;
  aorNodes: Array<{
    id: UUID; name: string; code: string; levelLabel: string; path: string;
  }>;
  departments: Array<{ id: UUID; name: string }>;
}

export interface RequestOptionsRepositoryPort {
  findForRequester(db: DbClient, tenantId: UUID, projectId: UUID,
    requesterId: UUID): Promise<RequestOptions | null>;
}

export async function getRequestOptions(
  repo: RequestOptionsRepositoryPort, db: DbClient,
  params: { tenantId: UUID; projectId: UUID; requesterId: UUID },
): Promise<RequestOptions> {
  const options = await repo.findForRequester(db, params.tenantId,
    params.projectId, params.requesterId);
  if (!options) throw new NotFoundError('Active requester project not found');
  return options;
}
