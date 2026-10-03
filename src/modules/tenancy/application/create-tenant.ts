import {randomUUID} from 'crypto';
import type {DbClient,UUID} from '@/shared/types';
import type {Tenant} from '../domain/types';
import type {ITenancyRepository} from './ports';
import {ValidationError} from '@/shared/errors';
import {bindAcquiredHomeOrganization} from './home-organization';

export interface CreateTenantParams {
 name:string;
 homeOrganization:{name:string;type:'GC'|'OWNER_REP'};
 acquisitionReference:string;
}
/** Axiom-controlled bootstrap only. Caller owns one transaction for account, company and audit. */
export async function createTenant(repo:ITenancyRepository,db:DbClient,params:CreateTenantParams):Promise<Tenant>{
 if(!params.name?.trim()||!params.homeOrganization?.name?.trim()||!['GC','OWNER_REP'].includes(params.homeOrganization.type)||!params.acquisitionReference?.trim())throw new ValidationError('Acquired tenant, home organization and acquisition reference are required');
 const tenant:Tenant={id:randomUUID() as UUID,name:params.name.trim(),createdAt:new Date()};
 const company={id:randomUUID() as UUID,tenantId:tenant.id,name:params.homeOrganization.name.trim(),type:params.homeOrganization.type,createdAt:tenant.createdAt};
 await repo.saveTenant(db,tenant);
 await repo.saveCompany(db,company);
 await bindAcquiredHomeOrganization(db,{tenantId:tenant.id,companyId:company.id,expectedCompanyId:null,caseReference:params.acquisitionReference});
 return {...tenant,homeCompanyId:company.id};
}
