import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewQuery } from '@/lib/review-query';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { reviewTickets, type ReviewOptions, type ReviewResult } from '@/modules/ticket/application/review-tickets';
import type { DbClient, UUID } from '@/shared/types';

const options: ReviewOptions = { projectId:'project' as UUID, visibility:{actorId:'actor' as UUID,actorRole:'VIEWER',companyId:'company' as UUID}, filters:{}, limit:25,offset:0,sort:'newest' };
test('review query validates dates, inclusive ranges, enums and duplicate filters', () => {
  for (const q of ['dateFrom=2024-02-30','dateFrom=2024-03-01&dateTo=2024-02-29','dateBasis=sql','crewId=bad','order=sql','dateFrom=2024-01-01&dateFrom=2024-02-01','limit=201']) {
    assert.throws(() => parseReviewQuery(new URLSearchParams(q)),q);
  }
  assert.equal(parseReviewQuery(new URLSearchParams('dateFrom=2024-02-29&dateTo=2024-02-29')).filters.dateTo,'2024-02-29');
});
test('review denies personnel comparisons for requester, IM and configuration-only admin', async () => {
  const db:DbClient = {query:async () => {throw new Error('must not query');}};
  for(const actorRole of ['REQUESTER','INSTRUMENT_MAN','PROJECT_ADMIN'] as const) {
    await assert.rejects(() => reviewTickets(new TicketRepository(),db,'tenant' as UUID,{...options,visibility:{...options.visibility,actorRole}}),{name:'ForbiddenError'});
  }
});
test('review aggregates and page use one scoped SQL statement with bound filters', async () => {
  const calls:Array<{sql:string;params:unknown[]}> = [];
  const db:DbClient = {async query<T extends object>(sql:string,params:unknown[]=[]) { calls.push({sql,params}); return {rows:[{result:{total:0}}] as T[]}; }};
  await new TicketRepository().review(db,'tenant' as UUID,{...options,visibility:{...options.visibility,actorRole:'PARTY_CHIEF',companyType:'SUBCONTRACTOR'},filters:{query:"%' OR 1=1 --",dateFrom:'2021-01-01',dateTo:'2021-12-31'},limit:10,offset:20});
  assert.equal(calls.length,1);
  const call=calls[0]!;
  assert.match(call.sql,/t.tenant_id=\$1 AND t.project_id=\$2/);
  assert.match(call.sql,/t.assigned_party_chief_id = \$3 AND t.company_id = \$4/);
  assert.match(call.sql,/FROM authorized t WHERE/);
  assert.match(call.sql,/authorized AS NOT MATERIALIZED/);
  assert.match(call.sql,/FROM filtered t/);
  assert.match(call.sql,/INTERVAL '1 day'/);
  assert.ok(!call.sql.includes("%' OR 1=1 --"));
  assert.deepEqual(call.params.slice(0,7),['tenant','project','actor','company','2021-01-01','2021-12-31',"%' OR 1=1 --"]);
  assert.deepEqual(call.params.slice(-2),[10,20]);
});
test('review empty Area scope remains deny-all, including filter facets', async () => {
  let sql='';
  const db:DbClient = {async query<T extends object>(query:string) {sql=query;return {rows:[{result:{total:0} as ReviewResult}] as T[]};}};
  await new TicketRepository().review(db,'tenant' as UUID,{...options,visibility:{...options.visibility,actorRole:'SURVEY_SUPERINTENDENT',aorNodeIds:[]}});
  assert.match(sql,/AND 1 = 0/);
  assert.match(sql,/FROM authorized t JOIN users/);
});
