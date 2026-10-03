/** Axiom acquisition/support operator; requires database operator access, never exposed via web. */
import {pool} from '../src/lib/db';
import {bindAcquiredHomeOrganization} from '../src/modules/tenancy/application/home-organization';
import type {UUID} from '../src/shared/types';
const args=process.argv.slice(2);
const value=(flag:string)=>args[args.indexOf(flag)+1];
async function main(){
 if(process.env.AXIOM_ACCOUNT_SUPPORT!=='explicit')throw new Error('Set AXIOM_ACCOUNT_SUPPORT=explicit for controlled account provisioning');
 const tenantId=value('--tenant'),companyId=value('--company'),expected=value('--expected'),caseReference=value('--case');
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!args.includes('--apply')||!args.includes('--tenant')||!args.includes('--company')||!args.includes('--expected')||!args.includes('--case')||!uuid.test(tenantId??'')||!uuid.test(companyId??'')||!(expected==='none'||uuid.test(expected??''))||!caseReference?.trim())throw new Error('Required: --tenant UUID --company UUID --expected none|UUID --case acquisition/support-reference --apply');
 const db=await pool.connect();
 try{await db.query('BEGIN');const result=await bindAcquiredHomeOrganization(db,{tenantId:tenantId as UUID,companyId:companyId as UUID,expectedCompanyId:expected==='none'?null:expected as UUID,caseReference});await db.query('COMMIT');console.log(JSON.stringify({tenantId,company:result.company}));}
 catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Account provisioning failed');process.exitCode=1;}).finally(()=>pool.end());
