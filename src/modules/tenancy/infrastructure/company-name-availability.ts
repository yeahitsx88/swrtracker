import {ConflictError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';

/** Call only after the owning writer holds the tenant EXCLUSIVE lifecycle barrier. */
export async function assertCompanyNameAvailable(db:DbClient,tenantId:UUID,name:string):Promise<void>{
  const {rows}=await db.query(`SELECT 1 FROM companies WHERE tenant_id=$1
    AND lower(btrim(regexp_replace(name,'[[:space:]]+',' ','g'))) =
        lower(btrim(regexp_replace($2::text,'[[:space:]]+',' ','g'))) LIMIT 1`,[tenantId,name]);
  if(rows.length)throw new ConflictError('A company with this name already exists in your tenant. Use its existing Company ID to associate it with this project.');
}
