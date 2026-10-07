import assert from 'node:assert/strict';
import test from 'node:test';
import { findProjectLandingHref, getProjectLandingHref, getProjectNavigation, getMembershipLandingHref } from '@/components/ui/project-navigation';

test('Home navigation preserves role-specific work and authorized scoped team views', () => {
  assert.deepEqual(getProjectNavigation('REQUESTER').map(i => i.label), ['Home','New Request','Requests','Drafts','Help Desk']);
  assert.deepEqual(getProjectNavigation('SURVEY_MANAGER').map(i => i.label), ['Home','Survey Operations','Team Management','All Requests','Review Requests','Notifications','Help Desk']);
  assert.deepEqual(getProjectNavigation('PARTY_CHIEF').map(i => i.label), ['Home','Crew Work','Field Report Review','Team Management','Review Requests','Notifications','Help Desk']);
  assert.deepEqual(getProjectNavigation('INSTRUMENT_MAN').map(i => i.label), ['Home','Crew Work','Notifications','Help Desk']);
  assert.deepEqual(getProjectNavigation('SURVEY_SUPERINTENDENT').map(i => i.label), ['Home','All Requests','Survey Operations','Crew Work','Team Management','Review Requests','Notifications','Help Desk']);
});
test('independent administration coexists with operations without granting them', () => {
  assert.deepEqual(getProjectNavigation('REQUESTER',true).map(i => i.label), ['Home','New Request','Requests','Drafts','Admin','Help Desk']);
  assert.deepEqual(getProjectNavigation('SURVEY_MANAGER',true).map(i => i.label), ['Home','Survey Operations','Team Management','All Requests','Admin','Review Requests','Notifications','Help Desk']);
  assert.deepEqual(getProjectNavigation(null,true).map(i => i.label), ['Home','Admin','Help Desk']);
  assert.deepEqual(getProjectNavigation(null,false), []);
  assert.deepEqual(getProjectNavigation('PROJECT_ADMIN',true).map(i => i.label), ['Home','Admin','Help Desk']);
  assert.ok(!getProjectNavigation('PROJECT_ADMIN',false).some(i => i.label === 'Admin'));
  assert.ok(getProjectNavigation('SURVEY_SUPERINTENDENT',true).some(i => i.label === 'Survey Operations'));
});
test('non-active projects retain history destinations without advertising new requests', () => {
  for (const status of ['SETUP','ARCHIVED'] as const) {
    assert.deepEqual(getProjectNavigation('REQUESTER',false,status).map(i => i.label), ['Home','Requests','Drafts','Help Desk']);
    assert.ok(getProjectNavigation('SURVEY_MANAGER',true,status).some(i => i.label === 'Admin'));
  }
});
test('landing offers role Home, retains setup administration and refuses unlisted access', () => {
  assert.equal(getProjectLandingHref('p','REQUESTER'), '/projects/p/home');
  assert.equal(getProjectLandingHref('p','SURVEY_MANAGER'), '/projects/p/home');
  assert.equal(getProjectLandingHref('p','PROJECT_ADMIN'), '/projects/p/admin');
  assert.equal(getMembershipLandingHref({id:'p',name:'P',status:'ARCHIVED',role:'INSTRUMENT_MAN'}), '/projects/p/home');
  assert.equal(getMembershipLandingHref({id:'p',name:'P',status:'SETUP',role:'REQUESTER',canAdminister:true}), '/projects/p/admin');
  assert.equal(findProjectLandingHref([{id:'p',name:'P',status:'ACTIVE',role:'SURVEY_MANAGER'}],' p '), '/projects/p/home');
  assert.equal(findProjectLandingHref([],'unknown'),null);
});
