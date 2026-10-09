import { NextResponse, type NextRequest } from 'next/server';
import { observeProjectRoute } from '@/lib/observe-project-route';
import { requireActiveAuth } from '@/lib/auth';
import { getProjectRole } from '@/lib/get-project-role';
import { withTransaction } from '@/lib/with-transaction';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { errorResponse } from '@/lib/api-error';
import { assertRecommissioningMutation } from '@/lib/recommissioning-gate';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';
import { authorizeTeamMutation } from '@/modules/tenancy/application/survey-teams';
import { createSurveyArea, parseNewSurveyArea } from '@/modules/tenancy/application/create-survey-area';
import { SurveyAreasPgRepository } from '@/modules/tenancy/infrastructure/survey-areas.repository';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';

export const dynamic='force-dynamic';
export const POST=observeProjectRoute(async (req:NextRequest,ctx:{params:Promise<{projectId:string}>})=>{
  try {
    const auth=await requireActiveAuth(req), {projectId}=await ctx.params;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId))throw new ValidationError('Choose a valid project.');
    let raw:unknown;try{raw=await req.json();}catch{throw new ValidationError('Enter valid Area details.');}
    const input=parseNewSurveyArea(raw), idempotencyKey=requireIdempotencyKey(req);
    const result=await withTransaction(async db=>{
      await coordinateAuthenticatedMutation(db,req,auth,'EXCLUSIVE',requireActiveAuth);
      const actorRole=await getProjectRole(db,auth.tenantId,projectId as UUID,auth.userId,auth.sessionVersion);
      const actor={tenantId:auth.tenantId,projectId:projectId as UUID,actorId:auth.userId,actorRole,sessionVersion:auth.sessionVersion};
      const repo=new SurveyAreasPgRepository();
      await authorizeTeamMutation(repo,db,actor);
      await assertRecommissioningMutation(db,auth.tenantId,projectId as UUID);
      return executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST:/api/projects/${projectId}/survey/areas`,idempotencyKey},input,async()=>{
        const area=await createSurveyArea(repo,db,actor,input);
        await appendAdministrativeEvent(db,{auth,projectId:projectId as UUID,subjectUserId:null,eventType:'project.configuration_changed',authorityEvidence:{actorRole},changes:{resource:'AREA_NODE',result:area,code:input.code}});
        return {status:201,body:{area}};
      });
    });
    return NextResponse.json(result.body,{status:result.status});
  }catch(error){return errorResponse(error);}
});
