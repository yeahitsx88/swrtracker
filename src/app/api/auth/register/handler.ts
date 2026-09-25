import { randomUUID } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
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
      typeof (body as Record<string, unknown>).email !== 'string' ||
      typeof (body as Record<string, unknown>).password !== 'string' ||
      typeof (body as Record<string, unknown>).name !== 'string' ||
      typeof (body as Record<string, unknown>).inviteToken !== 'string'
    ) {
      throw new ValidationError('tenantId, email, password, name, and inviteToken are required');
    }

    const { tenantId, email, password, name, inviteToken } = body as {
      tenantId: string;
      email: string;
      password: string;
      name: string;
      inviteToken: string;
    };
    const normalizedTenantId = tenantId.trim() as UUID;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    const normalizedInviteToken = inviteToken.trim();

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    if (!normalizedName) {
      throw new ValidationError('name is required');
    }
    if (!normalizedEmail) {
      throw new ValidationError('email is required');
    }
    if (!normalizedInviteToken) {
      throw new ValidationError('inviteToken is required');
    }

    const repo = deps.createRepo();
    const user = await deps.withTransaction(async (client) => {
      const invite = await repo.findActiveInviteByToken(client, normalizedInviteToken);
      if (!invite) {
        throw new ValidationError('inviteToken is invalid or expired');
      }
      if (invite.tenantId !== normalizedTenantId) {
        throw new ValidationError('inviteToken does not match tenantId');
      }
      if (invite.email.trim().toLowerCase() !== normalizedEmail) {
        throw new ValidationError('inviteToken does not match email');
      }
      if (!invite.companyId) {
        throw new ValidationError('inviteToken is not bound to a company');
      }
      if (invite.companyType === 'SUBCONTRACTOR' && invite.role !== 'REQUESTER') {
        throw new ValidationError('Subcontractor invitations must have requester access');
      }
      if (!invite.companyType) {
        throw new ValidationError('inviteToken is not bound to a valid company');
      }
      const suppliedCompanyId = (body as Record<string, unknown>).companyId;
      if (suppliedCompanyId !== undefined &&
          (typeof suppliedCompanyId !== 'string' || suppliedCompanyId.trim() !== invite.companyId)) {
        throw new ValidationError('companyId does not match invite');
      }
      const createdUser = await deps.createUser(repo, client, {
        tenantId: normalizedTenantId,
        companyId: invite.companyId,
        email: normalizedEmail,
        password,
        name: normalizedName,
      });

      const createdAt = new Date();
      await repo.saveProjectMembership(client, {
        id: randomUUID() as UUID,
        projectId: invite.projectId,
        userId: createdUser.id,
        role: invite.role as ProjectRole,
        createdAt,
      });
      await repo.markInviteAccepted(client, normalizedInviteToken, createdAt);

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
