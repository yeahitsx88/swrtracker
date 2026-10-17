import type { TenantNotificationTransaction } from '@/modules/notification/application/worker';
import { acquireTenantLifecycleLock } from './tenant-lifecycle-lock';
import { withTransaction } from './with-transaction';

/** Background work has no bearer; candidate/recipient eligibility is reread on this client. */
export const withTenantNotificationTransaction: TenantNotificationTransaction = (tenantId, fn) =>
  withTransaction(async db => {
    await acquireTenantLifecycleLock(db, tenantId, 'SHARED');
    return fn(db);
  });
