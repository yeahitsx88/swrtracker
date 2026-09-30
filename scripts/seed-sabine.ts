/** Local-only fixture loader. Source snapshot is anonymized before this boundary. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import { approveTicket } from '@/modules/ticket/application/approve-ticket';
import { assignTicket } from '@/modules/ticket/application/assign-ticket';
import { startTicket } from '@/modules/ticket/application/start-ticket';
import { completeTicket } from '@/modules/ticket/application/complete-ticket';
import { returnTicketForCorrection } from '@/modules/ticket/application/return-ticket-for-correction';
import type { TicketType } from '@/modules/ticket/domain/types';
import type { UUID } from '@/shared/types';

interface SourceRow {
  sourceId: number; area: string; type: TicketType | null; sourceType: string;
  status: string; cad: string; crew: number | null; requester: number;
  reported: string; need: string; completed: string | null;
  generatedCompletion: boolean; generatedNeed: boolean;
}
interface Snapshot { schema: number; crewCount: number; requesterCount: number; records: SourceRow[] }
const uid = (key: string): UUID => {
  const h = createHash('sha256').update(`sabine-v1:${key}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}` as UUID;
};
const tenant = uid('tenant'), live = uid('live'), history = uid('history'), company = uid('company');
const manager = uid('manager'), admin = uid('admin');
const source = JSON.parse(fs.readFileSync('.data/sabine/snapshot.json', 'utf8')) as Snapshot;
const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '15488' || url.pathname !== '/swr_sabine_simulation') {
  throw new Error('Refusing non-Sabine database');
}
if (!process.env.SABINE_PASSWORD) throw new Error('SABINE_PASSWORD required');
if (source.schema !== 1 || source.crewCount !== 42 || source.records.length !== 20199) throw new Error('Unexpected source manifest');
const areaNames = [...new Set([...source.records.map(r => r.area), 'Flare'])].sort();
const group = (a: string): number => a === 'Train 1' ? 1 : a === 'Train 2' ? 2 : a === 'Train 3' ? 3 : a.startsWith('Brownfield') ? 5 : 4;
const areaId = (project: UUID, name: string) => uid(`${project}:area:${name}`);

async function main() {
  const pool = new Pool({ connectionString: url.toString() });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(260929042)');
    if ((await db.query('SELECT 1 FROM tenants WHERE id=$1', [tenant])).rowCount) {
      await db.query('COMMIT');
      console.log('Sabine already seeded; preserving all existing work.');
      return;
    }
    if ((await db.query('SELECT count(*)::int AS n FROM tenants')).rows[0].n !== 0) throw new Error('Refusing nonempty database');
    const hash = await bcrypt.hash(process.env.SABINE_PASSWORD!, 12);
    await db.query("INSERT INTO tenants(id,name) VALUES($1,'Sabine — local simulation')", [tenant]);
    await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Sabine simulation personnel','GC')", [company,tenant]);
    for (const [p,name] of [[live,'Sabine — live simulation'],[history,'Sabine — historical simulation (read-only)']] as const) {
      await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,$3,'ACTIVE','FULL')",[p,tenant,name]);
      await db.query("INSERT INTO aor_levels(id,project_id,tenant_id,depth,label) VALUES($1,$2,$3,0,'Area')",[uid(`${p}:level`),p,tenant]);
      for (const [i,a] of areaNames.entries()) await db.query('INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$6)',[areaId(p,a),p,tenant,uid(`${p}:level`),a,`A${i+1}`]);
    }
    const people: {key:string; name:string; role:string; email:string}[] = [
      {key:'manager',name:'Sabine Survey Manager',role:'SURVEY_MANAGER',email:'manager@sabine.example'},
      {key:'admin',name:'Sabine Project IT',role:'PROJECT_ADMIN',email:'admin@sabine.example'},
    ];
    for(let i=1;i<=5;i++) people.push({key:`super:${i}`,name:`Survey Superintendent ${i}`,role:'SURVEY_SUPERINTENDENT',email:`super${i}@sabine.example`});
    for(let i=1;i<=42;i++) {
      people.push({key:`chief:${i}`,name:`Party Chief ${String(i).padStart(2,'0')}`,role:'PARTY_CHIEF',email:`chief${i}@sabine.example`});
      for(let j=1;j<=3;j++) people.push({key:`im:${i}:${j}`,name:`Instrument Man ${i}-${j}`,role:'INSTRUMENT_MAN',email:`im${i}.${j}@sabine.example`});
    }
    for(let i=0;i<source.requesterCount;i++) people.push({key:`requester:${i}`,name:`Requester ${String(i).padStart(3,'0')}`,role:'REQUESTER',email:`requester${i}@sabine.example`});
    for(const person of people) {
      await db.query("INSERT INTO users(id,tenant_id,company_id,email,password_hash,name,auth_method) VALUES($1,$2,$3,$4,$5,$6,'LOCAL')",[uid(person.key),tenant,company,person.email,hash,person.name]);
      await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3),($4,$2,\'VIEWER\')',[live,uid(person.key),person.role,history]);
    }
    await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,admin]);
    for(const p of [live,history]) {
      await db.query("INSERT INTO departments(id,tenant_id,project_id,name,manager_title,created_by) VALUES($1,$2,$3,'Construction','Construction Manager',$4)",[uid(`${p}:department`),tenant,p,admin]);
      for(const a of areaNames) await db.query('INSERT INTO aor_assignments(project_id,tenant_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[p,tenant,uid(`super:${group(a)}`),areaId(p,a)]);
      for(let i=1;i<=42;i++) {
        const frequencies = new Map<string,number>();
        for(const r of source.records) if(r.crew===i) frequencies.set(r.area,(frequencies.get(r.area)??0)+1);
        const dominant = [...frequencies].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0];
        if(!dominant) throw new Error(`Missing area for chief ${i}`);
        await db.query('INSERT INTO aor_assignments(project_id,tenant_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[p,tenant,uid(`chief:${i}`),areaId(p,dominant)]);
        for(let j=1;j<=3;j++) await db.query('INSERT INTO crew_rosters(project_id,tenant_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[p,tenant,uid(`chief:${i}`),uid(`im:${i}:${j}`)]);
      }
    }
    // Historical snapshots are not fabricated transition trails. One import creation
    // event records source state and simulation assumptions, atomically with each row.
    let imported=0;
    for(const r of source.records) {
      if(!r.type) continue; // Explicitly quarantined in the complete anonymized snapshot.
      const status = r.status==='Completed' ? 'COMPLETED' : r.status==='Canceled' ? 'SURVEY_CANCELED' : ['Ongoing','Started'].includes(r.status) ? 'IN_PROGRESS' : 'SUBMITTED';
      const id=uid(`historical:${r.sourceId}`);
      const note=`SIMULATION SNAPSHOT — Source list ID ${r.sourceId}. ${r.sourceType} in ${r.area}. Request prose and contact details replaced for privacy. Source field status: ${r.status}; CAD: ${r.cad}. ${r.generatedCompletion?'Completion date simulated.':'Completion date retained when available.'} ${r.status==='Canceled'?'Cancellation subtype unknown; Survey Canceled is a display mapping, not a recorded actor.':''}`;
      await db.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,department_id,company_id,ticket_number,ticket_type,requester_id,assigned_party_chief_id,assigned_instrument_man_id,workflow_variant,status,craft,field_contact,description,requested_date,original_requested_date,submitted_at,first_submitted_at,completed_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'STANDARD_APPROVAL',$12,'','Simulated field contact',$13,$14,$14,$15,$15,$16,$15,$15)`,
        [id,tenant,history,areaId(history,r.area),uid(`${history}:department`),company,`SAB-H-${r.sourceId}`,r.type,uid(`requester:${r.requester}`),r.crew?uid(`chief:${r.crew}`):null,r.crew?uid(`im:${r.crew}:${r.sourceId%3+1}`):null,status,note,r.need,r.reported,r.completed]);
      const payload={simulation:true,importSnapshot:true,sourceId:r.sourceId,sourceFieldStatus:r.status,sourceCadStatus:r.cad,completionDateGenerated:r.generatedCompletion,needByGenerated:r.generatedNeed,instrumentAssignmentSimulated:Boolean(r.crew),historicalTransitionsUnavailable:true};
      await db.query("INSERT INTO ticket_events(ticket_id,tenant_id,actor_id,event_type,payload) VALUES($1,$2,$3,'ticket.created',$4)",[id,tenant,admin,JSON.stringify(payload)]);
      // Preserve incompatible CAD states in the source note, rather than inventing a mapping.
      if(['Not Started','Complete','N/A','In Progress'].includes(r.cad)) await db.query('INSERT INTO cad_work(ticket_id,tenant_id,cad_status) VALUES($1,$2,$3)',[id,tenant,({'Not Started':'NOT_STARTED','Complete':'COMPLETE','N/A':'NOT_REQUIRED','In Progress':'IN_PROGRESS'} as Record<string,string>)[r.cad]]);
      imported++;
    }
    const repo=new TicketRepository();
    const supportedSources=source.records.filter(r=>r.type);
    // Two actionable cases per chief, with current dates and real application transitions.
    for(let i=0;i<84;i++) {
      const chief=i%42+1;
      const r=supportedSources[(i*239)%supportedSources.length];
      if(!r || !r.type) throw new Error(`No usable source for chief ${chief}`);
      const requester=uid(`requester:${i%6}`), im=uid(`im:${chief}:${i%3+1}`);
      const draft=await createTicket(repo,db,{tenantId:tenant,projectId:live,aorNodeId:areaId(live,r.area),departmentId:uid(`${live}:department`),companyId:company,requesterId:requester,ticketType:r.type,workflowVariant:'STANDARD_APPROVAL',craft:'',fieldContact:`Simulated Contact ${i+1}`,description:`LIVE SIMULATION — ${r.sourceType} in ${r.area}. Based on source list ID ${r.sourceId}; all personnel, prose, dates and workflow actions are simulated.`,requestedDate:new Date(Date.now()+((i%9)-2)*86400000)});
      const ticket=await submitTicket(repo,db,{tenantId:tenant,ticketId:draft.id,actorId:requester,actorRole:'REQUESTER',departmentId:uid(`${live}:department`),urgentReason:'Simulated short-notice field request'});
      const kind=Math.floor(i/14);
      if(kind===0) continue;
      if(kind===1) { await returnTicketForCorrection(repo,db,{tenantId:tenant,ticketId:ticket.id,actorId:manager,actorRole:'SURVEY_MANAGER',reason:'Simulation: clarify the work limits before approval.',origin:'INITIAL_REVIEW'}); continue; }
      await approveTicket(repo,db,{tenantId:tenant,ticketId:ticket.id,actorId:manager,actorRole:'SURVEY_MANAGER'});
      if(kind===2) continue;
      await assignTicket(repo,db,{tenantId:tenant,ticketId:ticket.id,actorId:manager,actorRole:'SURVEY_MANAGER',assignedPartyChiefId:uid(`chief:${chief}`),assignedInstrumentManId:im,surveyLeadId:manager});
      if(kind===3) continue;
      await startTicket(repo,db,{tenantId:tenant,ticketId:ticket.id,actorId:im,actorRole:'INSTRUMENT_MAN'});
      if(kind===5) await completeTicket(repo,db,{tenantId:tenant,ticketId:ticket.id,actorId:im,actorRole:'INSTRUMENT_MAN'});
    }
    await db.query('COMMIT');
    fs.writeFileSync('.data/sabine/manifest.json',JSON.stringify({tenantId:tenant,liveProjectId:live,historyProjectId:history,sourceRecords:source.records.length,imported,quarantined:source.records.length-imported,liveCases:84,chiefs:42,instrumentMen:126,superintendents:5,manager:1,people:people.length,sourceSnapshot:'snapshot.json',assumptions:['All prose replaced, no attachments or source identities','Missing/invalid completion dates synthesized','Historical cancellation subtype is a simulation display mapping','Chief home areas inferred from most frequent source area','Unclassified and laydown areas assigned to Utilities/Offsite coverage','Historical project memberships are VIEWER; live roles are operational','174 unsupported request types retained in snapshot, not reclassified','No Forms merge: source identifiers are not reliably unique']},null,2),{mode:0o600});
    console.log(`Seeded ${imported} historical snapshots and 84 live cases; ${people.length} anonymized identities. Tenant ${tenant}`);
  } catch(error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); await pool.end(); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
