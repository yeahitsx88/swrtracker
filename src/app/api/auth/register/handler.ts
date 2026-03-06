import { randomUUID } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import { createUser } from '@/modules/identity/application/create-user';
import type { IUserRepository } from '@/modules/identity/application/ports';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import type { DbClient, UUID } from '@/shared/types';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

export interface RegisterRouteDeps {
  db: DbClient;
  createRepo: () => IUserRepository;
  createUser: typeof createUser;
  withTransaction: TransactionRunner;
}

const defaultDeps: RegisterRouteDeps = {
  db: pool,
  createRepo: () => new UserRepository(),
  createUser,
  withTransaction,
};

export async function handlePostRegister(
  req: NextRequest,
  deps: RegisterRouteDeps = defaultDeps,
) {
  try {
    const body = await req.json() as unknown;

    if (
      !body ||
      typeof body !== 'object' ||
      typeof (body as Record<string, unknown>).tenantId !== 'string' ||
      typeof (body as Record<string, unknown>).companyId !== 'string' ||
      typeof (body as Record<string, unknown>).email !== 'string' ||
      typeof (body as Record<string, unknown>).password !== 'string' ||
      typeof (body as Record<string, unknown>).name !== 'string' ||
      (
        (body as Record<string, unknown>).inviteToken !== undefined &&
        typeof (body as Record<string, unknown>).inviteToken !== 'string'
      )
    ) {
      throw new ValidationError('tenantId, companyId, email, password, name, and optional inviteToken are required');
    }

    const { tenantId, companyId, email, password, name, inviteToken } = body as {
      tenantId: string;
      companyId: string;
      email: string;
      password: string;
      name: string;
      inviteToken?: string;
    };
    const normalizedTenantId = tenantId.trim() as UUID;
    const normalizedCompanyId = companyId.trim() as UUID;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    const normalizedInviteToken = inviteToken?.trim();

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    if (!normalizedName) {
      throw new ValidationError('name is required');
    }
    if (!normalizedEmail) {
      throw new ValidationError('email is required');
    }

    const repo = deps.createRepo();
    const companyBelongsToTenant = await repo.isCompanyInTenant(
      deps.db,
      normalizedTenantId,
      normalizedCompanyId,
    );
    if (!companyBelongsToTenant) {
      throw new ValidationError('companyId must reference a company in this tenant');
    }

    let memberships: Array<{ projectId: UUID; role: ProjectRole }> = [];
    if (normalizedInviteToken) {
      const invite = await repo.findActiveInviteByToken(deps.db, normalizedInviteToken);
      if (!invite) {
        throw new ValidationError('inviteToken is invalid or expired');
      }
      if (invite.tenantId !== normalizedTenantId) {
        throw new ValidationError('inviteToken does not match tenantId');
      }
      if (invite.email.trim().toLowerCase() !== normalizedEmail) {
        throw new ValidationError('inviteToken does not match email');
      }
      memberships = [{ projectId: invite.projectId, role: invite.role as ProjectRole }];
    } else {
      const domainAllowed = await repo.isDomainAllowed(deps.db, normalizedTenantId, normalizedEmail);
      if (!domainAllowed) {
        throw new ForbiddenError(
          'Your email domain is not authorised for self-registration. Contact your project administrator for an invite.',
        );
      }

      const projectIds = await repo.listRegisterableProjectIds(deps.db, normalizedTenantId);
      memberships = projectIds.map((projectId) => ({ projectId, role: 'REQUESTER' as const }));
    }

    const user = await deps.withTransaction(async (client) => {
      const createdUser = await deps.createUser(repo, client, {
        tenantId: normalizedTenantId,
        companyId: normalizedCompanyId,
        email: normalizedEmail,
        password,
        name: normalizedName,
      });

      const createdAt = new Date();
      for (const membership of memberships) {
        await repo.saveProjectMembership(client, {
          id: randomUUID() as UUID,
          projectId: membership.projectId,
          userId: createdUser.id,
          role: membership.role,
          createdAt,
        });
      }

      if (normalizedInviteToken) {
        await repo.markInviteAccepted(client, normalizedInviteToken, createdAt);
      }

      return createdUser;
    });

    return NextResponse.json(
      { user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId } },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
