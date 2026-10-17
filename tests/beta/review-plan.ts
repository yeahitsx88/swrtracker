import fs from 'node:fs';
import { Pool } from 'pg';
import { buildReviewQuery } from '../../src/modules/ticket/infrastructure/review-query';
import type { UUID } from '../../src/shared/types';

async function main() {
  if(process.env.SWR_REVIEW_PLAN!=='1') throw new Error('Explicit SWR_REVIEW_PLAN=1 required');
  const config=JSON.parse(fs.readFileSync('.data/sabine/runtime.json','utf8'));
  const manifest=JSON.parse(fs.readFileSync('.data/sabine/manifest.json','utf8'));
  const url=new URL(config.DATABASE_URL);
  if(url.pathname!=='/swr_sabine_simulation') throw new Error('Sabine database required');
  const db=new Pool({connectionString:config.DATABASE_URL});
  try {
    const {rows}=await db.query('SELECT aor_node_id FROM tickets WHERE tenant_id=$1 AND project_id=$2 GROUP BY aor_node_id ORDER BY count(*) DESC LIMIT 1',[manifest.tenantId,manifest.historyProjectId]);
    const q=buildReviewQuery(manifest.tenantId,{projectId:manifest.historyProjectId,visibility:{actorId:'unused' as UUID,actorRole:'VIEWER',companyId:'unused' as UUID},filters:{areaId:rows[0].aor_node_id,status:'COMPLETED'},limit:10,offset:0,sort:'newest'},{sql:'',params:[]});
    const plan=await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+q.sql,q.params);
    const tree=plan.rows[0]['QUERY PLAN'][0];
    function walk(n:any) { if(n['Actual Total Time']>50) console.log(JSON.stringify({node:n['Node Type'],relation:n['Relation Name'],rows:n['Actual Rows'],estimated:n['Plan Rows'],loops:n['Actual Loops'],ms:n['Actual Total Time']})); for(const c of n.Plans??[]) walk(c); }
    walk(tree.Plan); console.log(JSON.stringify({planningMs:tree['Planning Time'],executionMs:tree['Execution Time'],jit:tree.JIT?.Timing}));
  } finally {await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
