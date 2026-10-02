import assert from 'node:assert/strict';
export function verifyEvidence(evidence,run,population) {
  const actor = key => population.actors.find(a=>a.key===key).id;
  assert.equal(evidence.totalAccountCount,16);
  assert.equal(evidence.tenantRoleHolders.length,2);
  assert.ok(evidence.tenantRoleHolders.every(row=>[actor('central-it'),actor('foreign-control')].includes(row.user_id)&&row.role==='TENANT_ADMIN'));
  assert.ok(!evidence.tenantRoleHolders.some(row=>row.user_id===actor('project-admin')));
  const grant=evidence.adminGrants.find(row=>row.project_id===run.projectId&&row.user_id===actor('project-admin'));
  assert.ok(grant&&!grant.revoked_at);
  assert.ok(evidence.adminGrants.some(row=>row.project_id===run.projectId&&row.user_id===actor('owner-witness')&&row.revoked_at));
  const ticket=evidence.workflow.find(row=>row.id===run.ticketId);
  assert.equal(ticket.status,'COMPLETED');assert.equal(ticket.requester_id,actor('requester-1'));assert.equal(ticket.assigned_instrument_man_id,actor('instrument-1'));
  for(const [type,key] of [['ticket.created','requester-1'],['ticket.draft_saved','requester-1'],['ticket.submitted','requester-1'],['ticket.approved','manager'],['ticket.assigned','superintendent'],['ticket.in_progress','instrument-1'],['ticket.completed','instrument-1']]) {
    const events=ticket.events.filter(e=>e.type===type);assert.equal(events.length,1,type);assert.equal(events[0].actorId,actor(key),type);
  }
  const administrative=evidence.administrativeEvents.filter(row=>row.project_id===run.projectId);
  assert.ok(administrative.some(row=>row.event_type==='project.created'&&row.actor_id===actor('central-it')));
  assert.ok(administrative.some(row=>row.event_type==='project.member_added'&&row.actor_id===actor('project-admin')));
  assert.ok(administrative.some(row=>row.event_type==='project.activated'&&row.actor_id===actor('project-admin')));
  assert.equal(evidence.staffingEvents.filter(row=>row.project_id===run.projectId&&row.actor_id===actor('manager')).length,2);
}
