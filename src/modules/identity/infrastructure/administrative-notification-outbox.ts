import {randomUUID} from 'node:crypto';
import type {DbClient,UUID} from '@/shared/types';
import {acquireTenantLifecycleLock} from '@/lib/tenant-lifecycle-lock';
import type {IEmailTransport} from '@/lib/email';

interface Delivery {id:UUID;tenant_id:UUID;review_id:UUID;recipient_id:UUID;lease_token:UUID;attempts:number}
type Transaction=<T>(fn:(db:DbClient)=>Promise<T>)=>Promise<T>;
/** Stable outbox identity is supplied to transport; external delivery itself cannot be database-atomic. */
export async function dispatchAdministrativeNotifications(db:DbClient,transaction:Transaction,transport:IEmailTransport):Promise<number>{
  const tenants=(await db.query<{tenant_id:UUID}>(`SELECT DISTINCT tenant_id FROM administrative_notification_outbox
    WHERE delivered_at IS NULL AND attempts<8 AND available_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY tenant_id LIMIT 20`)).rows;
  let sent=0;
  for(const tenant of tenants){
    const lease=randomUUID();
    const deliveries=await transaction(async held=>{
      await acquireTenantLifecycleLock(held,tenant.tenant_id,'SHARED');
      return (await held.query<Delivery>(`UPDATE administrative_notification_outbox o SET lease_token=$2,lease_until=NOW()+interval '2 minutes',attempts=attempts+1
        WHERE o.tenant_id=$1 AND o.id IN (SELECT id FROM administrative_notification_outbox WHERE tenant_id=$1 AND delivered_at IS NULL AND attempts<8
          AND available_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY available_at,id LIMIT 10 FOR UPDATE SKIP LOCKED)
        RETURNING o.id,o.tenant_id,o.review_id,o.recipient_id,o.lease_token,o.attempts`,[tenant.tenant_id,lease])).rows;
    });
    for(const delivery of deliveries){
      try{
        const delivered=await transaction(async held=>{
          await acquireTenantLifecycleLock(held,delivery.tenant_id,'SHARED');
          const recipient=(await held.query<{email:string;eligible:boolean}>(`SELECT u.email,EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=u.tenant_id AND tm.user_id=u.id AND tm.role='TENANT_ADMIN')
            AND u.deactivated_at IS NULL AND c.type IN ('GC','OWNER_REP') AS eligible FROM administrative_notification_outbox o
            JOIN users u ON u.id=o.recipient_id AND u.tenant_id=o.tenant_id JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
            WHERE o.tenant_id=$1 AND o.id=$2 AND o.lease_token=$3 AND o.lease_until>NOW() AND o.delivered_at IS NULL FOR UPDATE OF o`,[delivery.tenant_id,delivery.id,delivery.lease_token])).rows[0];
          if(!recipient)return false;
          if(!recipient.eligible)throw Error('Administrative recipient is no longer eligible');
          await transport.send({to:[recipient.email],subject:'Project access removal requires review',
            text:'A project access removal is ready for Central IT review. Open the authenticated account administration review queue. Tenant account disablement requires a separate confirmed action.',
            metadata:{kind:'account.offboarding.review',tenantId:delivery.tenant_id,reviewId:delivery.review_id,idempotencyKey:delivery.id}});
          await held.query(`UPDATE administrative_notification_outbox SET delivered_at=NOW(),lease_token=NULL,lease_until=NULL,last_error=NULL
            WHERE tenant_id=$1 AND id=$2 AND lease_token=$3`,[delivery.tenant_id,delivery.id,delivery.lease_token]);
          return true;
        });
        if(delivered)sent++;
      }catch{
        // Store a bounded code, never provider response text, credentials or message content.
        await transaction(async held=>{
          await acquireTenantLifecycleLock(held,delivery.tenant_id,'SHARED');
          await held.query(`UPDATE administrative_notification_outbox SET lease_token=NULL,lease_until=NULL,last_error='DELIVERY_FAILED_OR_RECIPIENT_INELIGIBLE',
            available_at=NOW()+LEAST(3600,30*power(2,attempts)) * interval '1 second' WHERE tenant_id=$1 AND id=$2 AND lease_token=$3 AND delivered_at IS NULL`,
            [delivery.tenant_id,delivery.id,delivery.lease_token]);
        });
      }
    }
  }
  return sent;
}
