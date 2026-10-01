import {ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import {protectedUuid} from './read-protected-obligations';
import type {SuperintendentAreaRepository,SuperintendentAreaReadQuery,SuperintendentAreaPageQuery} from './superintendent-area.types';
export function parseSuperintendentAreaReadQuery(values:URLSearchParams):SuperintendentAreaReadQuery{
 const mode=values.get('mode');
 if(!['superintendent-areas','superintendent-area-replacements','superintendent-area-reporting'].includes(mode??''))throw new ValidationError('Choose a supported Superintendent Area view');
 const allowed=['mode','superintendentId','search','limit','offset',...(mode==='superintendent-areas'?[]:['linkId'])];
 for(const key of values.keys())if(!allowed.includes(key)||values.getAll(key).length!==1)throw new ValidationError('Use one value for each supported Area filter');
 const rawSearch=values.get('search')??'',limit=values.get('limit')??'25',offset=values.get('offset')??'0';
 if(rawSearch.length>200||/[\u0000-\u001f\u007f]/.test(rawSearch)||!/^(10|25|50|100)$/.test(limit)||!/^\d+$/.test(offset)||!Number.isSafeInteger(Number(offset)))throw new ValidationError('Use bounded Area pagination and search');
 const superintendentId=(values.get('superintendentId')??'').toLowerCase();
 if(!protectedUuid.test(superintendentId))throw new ValidationError('Choose a valid Superintendent');
 const query={search:rawSearch.trim(),limit:Number(limit) as SuperintendentAreaPageQuery['limit'],offset:Number(offset)};
 if(mode==='superintendent-areas')return{mode,superintendentId:superintendentId as UUID,query};
 const linkId=(values.get('linkId')??'').toLowerCase();
 if(!protectedUuid.test(linkId))throw new ValidationError('Choose a valid individual assignment');
 return{mode:mode as 'superintendent-area-replacements'|'superintendent-area-reporting',superintendentId:superintendentId as UUID,linkId:linkId as UUID,query};
}
export async function readSuperintendentAreas(repo:Pick<SuperintendentAreaRepository,'readPage'>,db:DbClient,auth:AuthContext,projectId:UUID,input:SuperintendentAreaReadQuery){
 return repo.readPage(db,auth,projectId,input);
}
