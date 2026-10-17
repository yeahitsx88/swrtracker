import {ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import type {ProtectedObligationsRepository,ProtectedReadQuery,ProtectedPageQuery} from './protected-obligations.types';
export const protectedUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseProtectedReadQuery(values:URLSearchParams):ProtectedReadQuery{
 const mode=values.get('mode');
 if(!['personnel','obligations','candidates'].includes(mode??''))throw new ValidationError('Choose a supported obligation view');
 const allowed=['mode','search','limit','offset',...(mode==='personnel'?[]:['userId']),...(mode==='candidates'?['grantId']:[])];
 for(const key of values.keys())if(!allowed.includes(key)||values.getAll(key).length!==1)throw new ValidationError('Use one value for each supported obligation filter');
 const limit=values.get('limit')??'25',offset=values.get('offset')??'0',search=(values.get('search')??'').trim();
 if(!/^(10|25|50|100)$/.test(limit)||!/^\d+$/.test(offset)||!Number.isSafeInteger(Number(offset))||(search.length>200||/[\u0000-\u001f\u007f]/.test(search)))throw new ValidationError('Use bounded obligation pagination and search');
 const query={search,limit:Number(limit) as ProtectedPageQuery['limit'],offset:Number(offset)};
 if(mode==='personnel')return{mode,query};
 const userId=(values.get('userId')??'').toLowerCase();if(!protectedUuid.test(userId))throw new ValidationError('Choose a valid project person');
 if(mode==='obligations')return{mode,userId:userId as UUID,query};
 const grantId=(values.get('grantId')??'').toLowerCase();if(!protectedUuid.test(grantId))throw new ValidationError('Choose a valid obligation');
 return{mode:'candidates',userId:userId as UUID,grantId:grantId as UUID,query};
}
export async function readProtectedObligations(repo:ProtectedObligationsRepository,db:DbClient,auth:AuthContext,projectId:UUID,query:ProtectedReadQuery){
 const authority=await repo.readAuthority(db,auth,projectId);
 return repo.readPage(db,{tenantId:auth.tenantId,projectId},authority,query);
}
