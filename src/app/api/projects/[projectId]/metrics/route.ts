import {observeProjectRoute} from '@/lib/observe-project-route';
import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { withTransaction } from '@/lib/with-transaction';
import { SurveyWorkforcePgRepository } from '@/modules/tenancy/infrastructure/survey-workforce.repository';
import { readWorkforceMember } from '@/modules/tenancy/application/survey-workforce';
import { memberMetricFocus } from '@/modules/reporting/application/member-metrics';
import type { MetricsFilters } from '@/modules/reporting/application/metrics-filters';
import { resolveProjectInsightRole } from '@/lib/project-insight-auth';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { getAmeliaMetrics } from '@/modules/reporting/application/amelia-metrics';
import { AmeliaMetricsReader } from '@/modules/reporting/infrastructure/amelia-metrics.reader';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { parseMetricsQuery } from '@/lib/metrics-query';
import { canAnalyzeSurveyPersonnel } from '@/modules/reporting/application/metrics-filters';
import { getCommandActivity } from '@/modules/reporting/application/command-activity';
import { PostgresCommandActivityReader } from '@/modules/reporting/infrastructure/command-activity.reader';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

async function observedGET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(projectId)) throw new ValidationError('Invalid project');
    const projectUuid = projectId as UUID;
    const search = new URLSearchParams(req.nextUrl.searchParams);
    if (search.getAll('view').length > 1 || (search.has('view') && !['charts', 'activity'].includes(search.get('view') ?? ''))) throw new ValidationError('Invalid metrics view');
    const view = search.get('view');
    const includeCharts = view === 'charts';
    search.delete('view');
    if (view === 'activity' && (search.has('cohort') || search.has('population') || search.has('dateBasis'))) throw new ValidationError('Activity uses event dates across all request statuses');
    const memberId=search.get('memberId');
    if(search.getAll('memberId').length>1||(memberId!==null&&!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(memberId)))throw new ValidationError('Invalid member');
    search.delete('memberId');
    let filters = parseMetricsQuery(search);
    return await withTransaction(async db=>{
    if(memberId||filters.crewId||filters.instrumentManId)await db.query('SELECT id FROM projects WHERE tenant_id=$1 AND id=$2 FOR SHARE',[auth.tenantId,projectUuid]);
    const role = await resolveProjectInsightRole(auth, projectUuid, db);
    if (role === 'BILLING_VIEWER') throw new ForbiddenError('Billing access does not grant request analytics');
    // Tenant administrators retain read-only project health, not workflow authority.
    let visibility = await resolveVisibility(db, auth.tenantId, projectUuid, auth.userId, role === 'TENANT_ADMIN' ? 'VIEWER' : role, memberId&&role==='SURVEY_MANAGER'?undefined:filters.cohort);
    const actor={tenantId:auth.tenantId,projectId:projectUuid,actorId:auth.userId,actorRole:role==='TENANT_ADMIN'?'VIEWER' as const:role,sessionVersion:auth.sessionVersion};
    const workforce=new SurveyWorkforcePgRepository();
    for(const personId of [filters.crewId,filters.instrumentManId])if(personId && !(actor.actorRole==='PARTY_CHIEF'&&personId===filters.crewId&&personId===actor.actorId))await readWorkforceMember(workforce,db,actor,personId as UUID);
    let memberFocus:Pick<MetricsFilters,'crewId'|'instrumentManId'>|undefined;
    if(memberId){
      if(view==='activity')throw new ValidationError('Member drilldown uses the KPI explorer');
      const person=await readWorkforceMember(workforce,db,actor,memberId as UUID);
      memberFocus=memberMetricFocus(person,actor.actorRole,filters);
      if(actor.actorRole==='SURVEY_SUPERINTENDENT'){filters={...filters,cohort:'linkedCrews',...memberFocus};visibility=await resolveVisibility(db,auth.tenantId,projectUuid,auth.userId,actor.actorRole,'linkedCrews');}
      else if(person.role==='SURVEY_SUPERINTENDENT'){
        filters={...filters,cohort:'linkedCrews'};
        visibility=await resolveVisibility(db,auth.tenantId,projectUuid,person.userId,'SURVEY_SUPERINTENDENT','linkedCrews');
      }else filters={...filters,...memberFocus};
    }
    if (view === 'activity') {
      const activity = await getCommandActivity(new PostgresCommandActivityReader(), db, {
        tenantId: auth.tenantId, projectId: projectUuid, visibility, filters,
      });
      return NextResponse.json({ activity }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json({ metrics: await getAmeliaMetrics(new AmeliaMetricsReader(), db, {
      tenantId: auth.tenantId, projectId: projectUuid, visibility, filters, includeCharts, memberFocus, includePersonnelCharts: !memberId,
    }), analytics: { filters, personnelFilters: !memberId && canAnalyzeSurveyPersonnel(visibility.actorRole, !!visibility.linkedCrewAssignments?.length),
      supportsLinkedCrewScope: !memberId && visibility.actorRole === 'SURVEY_SUPERINTENDENT',
      scopeKind: visibility.actorRole === 'SURVEY_SUPERINTENDENT' ? filters.cohort ?? 'areaWorkload' : 'authorized',
      ...(visibility.linkedCrewAssignments ? { linkedCrewCount: new Set(visibility.linkedCrewAssignments.map(row=>row.partyChiefId)).size } : {}), dateTimezone: 'UTC' } }, { headers: { 'Cache-Control': 'private, no-store' } });
  });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET=observeProjectRoute(observedGET);
