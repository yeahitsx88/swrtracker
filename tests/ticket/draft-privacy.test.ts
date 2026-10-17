import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisibilityClause } from '@/lib/ticket-visibility-clause';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { UUID } from '@/shared/types';
test('every ordinary broad role excludes another requester draft at the shared read boundary',()=>{
  const roles:ProjectRole[]=['SURVEY_MANAGER','CAD_LEAD','CAD_TECHNICIAN','VIEWER',
    'SUBCONTRACTS_COORDINATOR','DEPARTMENT_MANAGER','DEPARTMENT_LEAD','PARTY_CHIEF',
    'INSTRUMENT_MAN','SURVEY_SUPERINTENDENT','AREA_VIEWER'];
  for(const actorRole of roles){
    const clause=buildVisibilityClause({actorId:'actor' as UUID,actorRole,
      companyId:'company' as UUID,companyType:'GC',departmentId:'dept' as UUID,
      aorNodeIds:['area' as UUID]},3);
    assert.match(clause.sql,/t.status <> 'DRAFT' OR t.requester_id = \$\d+/);
    assert.equal(clause.params.at(-1),'actor');
  }
});