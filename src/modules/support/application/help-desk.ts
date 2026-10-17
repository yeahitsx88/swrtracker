import type {AuthContext} from '@/lib/auth';
import {resolveProjectCapabilities} from '@/lib/project-capabilities';
import {getTenantRole} from '@/lib/get-tenant-role';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import {ConflictError,ForbiddenError,NotFoundError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
export async function authorizeSupport(db:DbClient,auth:AuthContext,projectId?:UUID){
 if(!projectId){if(await getTenantRole(db,auth.tenantId,auth.userId,auth.sessionVersion)!=='TENANT_ADMIN')throw new ForbiddenError('Tenant Admin access is required for the tenant help desk.');return {canManage:true};}
 const capability=await resolveProjectCapabilities(db,auth,projectId);
 if(!capability.operationalRole&&!capability.canAdminister)throw new ForbiddenError('Current project membership is required to use the help desk.');
 return {canManage:capability.canAdminister};
}
export async function readSupport(db:DbClient,auth:AuthContext,projectId:UUID|undefined,offset:number){
 const authority=await authorizeSupport(db,auth,projectId);
 const tickets=(await db.query(`SELECT t.id,t.project_id AS "projectId",p.name AS "projectName",t.subject,t.description,t.status,t.version,t.created_at AS "createdAt",u.name AS "requesterName",u.id AS "requesterId",count(*) OVER()::int AS total
  FROM project_support_tickets t JOIN projects p ON p.id=t.project_id AND p.tenant_id=t.tenant_id JOIN users u ON u.id=t.requester_id AND u.tenant_id=t.tenant_id
  WHERE t.tenant_id=$1 AND ($2::uuid IS NULL OR t.project_id=$2) AND ($3::boolean OR t.requester_id=$4)
  ORDER BY CASE t.status WHEN 'ESCALATED' THEN 0 WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END,t.created_at DESC,t.id LIMIT 25 OFFSET $5`,[auth.tenantId,projectId??null,authority.canManage,auth.userId,offset])).rows;
 return {tickets,total:tickets[0]?.total??0,limit:25,offset,canManage:authority.canManage};
}
export async function createSupport(db:DbClient,auth:AuthContext,projectId:UUID,input:{subject:unknown;description:unknown}){
 await authorizeSupport(db,auth,projectId);
 if(typeof input.subject!=='string'||input.subject.trim().length<3||input.subject.length>120||typeof input.description!=='string'||input.description.trim().length<10||input.description.length>4000)throw new ValidationError('Enter a subject of 3–120 characters and details of 10–4000 characters.');
 const ticket=(await db.query(`INSERT INTO project_support_tickets(tenant_id,project_id,requester_id,subject,description) VALUES($1,$2,$3,$4,$5) RETURNING id,version,status`,[auth.tenantId,projectId,auth.userId,input.subject.trim(),input.description.trim()])).rows[0]!;
 await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:auth.userId,eventType:'support.created',authorityEvidence:{projectMember:true},changes:{supportTicketId:ticket.id,status:ticket.status}});
 return ticket;
}
export async function supportDetail(db:DbClient,auth:AuthContext,projectId:UUID,ticketId:UUID){
 const authority=await authorizeSupport(db,auth,projectId);
 const ticket=(await db.query('SELECT id,requester_id,status,version FROM project_support_tickets WHERE tenant_id=$1 AND project_id=$2 AND id=$3',[auth.tenantId,projectId,ticketId])).rows[0];
 if(!ticket||!authority.canManage&&ticket.requester_id!==auth.userId)throw new NotFoundError('Help desk ticket not found.');
 const messages=(await db.query(`SELECT * FROM (SELECT m.id,m.message,m.created_at AS "createdAt",u.name AS "actorName" FROM project_support_messages m JOIN users u ON u.id=m.actor_id AND u.tenant_id=m.tenant_id WHERE m.tenant_id=$1 AND m.ticket_id=$2 ORDER BY m.created_at DESC,m.id DESC LIMIT 200) latest ORDER BY "createdAt",id`,[auth.tenantId,ticketId])).rows;
 return {ticket,messages,canManage:authority.canManage};
}
export async function updateSupport(db:DbClient,auth:AuthContext,projectId:UUID,ticketId:UUID,input:{version:number;message:string;status?:string}){
 const authority=await authorizeSupport(db,auth,projectId);
 const ticket=(await db.query<{id:UUID;requester_id:UUID;status:string;version:number}>('SELECT id,requester_id,status,version FROM project_support_tickets WHERE tenant_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE',[auth.tenantId,projectId,ticketId])).rows[0];
 if(!ticket||!authority.canManage&&ticket.requester_id!==auth.userId)throw new NotFoundError('Help desk ticket not found.');
 if(input.status!==undefined&&!authority.canManage)throw new ForbiddenError('Only Project Admin or Tenant Admin can change help desk status.');
 if(ticket.version!==input.version)throw new ConflictError('This help desk ticket changed. Reload its conversation and review again.');
 if(!input.message.trim()||input.message.length>4000||input.status!==undefined&&!['OPEN','IN_PROGRESS','RESOLVED','ESCALATED'].includes(input.status))throw new ValidationError('Enter a reply and choose a supported help desk status.');
 await db.query('INSERT INTO project_support_messages(tenant_id,ticket_id,actor_id,message) VALUES($1,$2,$3,$4)',[auth.tenantId,ticketId,auth.userId,input.message.trim()]);
 await db.query('UPDATE project_support_tickets SET status=$4,version=version+1,updated_at=now() WHERE tenant_id=$1 AND project_id=$2 AND id=$3',[auth.tenantId,projectId,ticketId,input.status??ticket.status]);
 await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:ticket.requester_id,eventType:'support.updated',authorityEvidence:{administrator:authority.canManage},changes:{supportTicketId:ticketId,previousStatus:ticket.status,status:input.status??ticket.status,replyAdded:true}});
 return {updated:true};
}
