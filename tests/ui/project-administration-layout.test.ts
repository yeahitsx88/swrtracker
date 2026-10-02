import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(path,'utf8');

test('project administration presents independent native disclosures in the approved task order',()=>{
 const administration=source('src/components/ui/project-administration.tsx');
 const invitations=source('src/components/ui/requester-invitations.tsx');
 const headings=[...administration.matchAll(/<summary><h2 className="panel-title">([^<]+)/g)].map(match=>match[1]);
 assert.deepEqual(headings,['Add a project member','Independent Project Admin assignments','Project members and access']);
 assert.ok(administration.indexOf('<RequesterInvitations key={projectId}')<administration.indexOf('<summary>'));
 assert.match(invitations,/<details className="panel project-admin-section" open>/);
 assert.ok(invitations.includes('<summary><h2 className="panel-title">Invite a new requester</h2></summary>'));
 assert.equal(administration.match(/<details className="panel project-admin-section">/g)?.length,3);
 assert.doesNotMatch(administration,/onToggle|setOpen|openSections/);
 assert.match(administration,/commandOwner={owner}/);
 assert.match(administration,/selected&&<AccountOffboarding/);
 assert.ok(administration.indexOf('aria-label="Confirm project administration"')>administration.lastIndexOf('</details>'));
 assert.doesNotMatch(invitations,/Add a project member” above/);
});

test('administered Active projects reuse the Launcher badge and display label',()=>{
 const creation=source('src/components/ui/project-creation.tsx');
 const launcher=source('src/app/(projects)/projects/page.tsx');
 assert.ok(launcher.includes('badge status-badge tone-success'));
 assert.ok(creation.includes("badge status-badge ${p.status==='ACTIVE'?'tone-success':'tone-neutral'}"));
 assert.ok(creation.includes('PROJECT_STATUS_LABELS[p.status]'));
});

test('project disclosure headings preserve native markers, focus and mobile wrapping',()=>{
 const css=source('src/app/globals.css');
 assert.ok(css.includes('.project-admin-section { display: block; padding: 0; }'));
 assert.match(css,/project-admin-section > summary {[^}]*min-height: 44px;[^}]*overflow-wrap: anywhere;/);
 assert.ok(css.includes('.project-admin-section > summary::marker { color: var(--action); }'));
 assert.ok(css.includes('.project-admin-section > summary, .project-admin-section-content { padding: 1rem; }'));
 assert.ok(css.includes(':focus-visible { outline: 3px solid var(--action);'));
});
