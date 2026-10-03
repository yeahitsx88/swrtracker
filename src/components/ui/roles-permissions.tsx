 'use client';
import {useState} from 'react';
import type {CommandOwner} from '@/lib/frozen-command';
import type {CustomRole,CustomRoleDirectory} from '@/modules/tenancy/domain/custom-role';
import {ENROLLMENT_ROLES} from '@/modules/tenancy/domain/member-invitation';
import {OPERATIONAL_ROLE_PROFILES} from '@/modules/tenancy/domain/operational-role-profiles';
import {roleLabel} from '@/lib/display-labels';
import {CustomRoleCreation} from './custom-role-creation';
import {Card} from './card';
import {Button} from './button';
import {AdministrationDialog} from './administration-dialog';
import './roles-permissions.css';

export function RolesPermissions({directory,owner,disabled,onCreated,onReload,allowCreate=true}:{directory?:CustomRoleDirectory;owner:CommandOwner;disabled?:boolean;onCreated:(role:CustomRole)=>void;onReload:()=>void;allowCreate?:boolean}){
 const [faq,setFaq]=useState(false);
 return <Card title="Roles & Permissions" help="Tenant-wide custom roles use an existing permission type. Area and department scope is assigned separately in each project; administrative authority remains separate."><div className="stack">
  <div><Button variant="secondary" disabled={disabled||owner.snapshot()!==null} onClick={()=>setFaq(true)}>Roles & Permissions FAQ</Button></div>
  <CustomRoleCreation directory={directory?{...directory,canCreate:directory.canCreate&&allowCreate}:undefined} owner={owner} disabled={disabled||faq} onCreated={onCreated} onReload={onReload}/>
  {faq&&<AdministrationDialog title="Roles & Permissions FAQ" size="wide" onClose={()=>setFaq(false)} footer={<Button onClick={()=>setFaq(false)}>Close FAQ</Button>}>
   <details open><summary>Who Can Administer the Tenant and Its Projects?</summary><dl className="administration-dialog-summary"><div><dt>Tenant IT / Central IT</dt><dd>Manage tenant accounts, templates, custom roles and every project's administration. Operational work requires its own project role. Axiom owns the account-bound home organization.</dd></div><div><dt>Project Admin</dt><dd>Independent authority to administer one project. Preserves the person's operational role; does not automatically grant survey review or field execution.</dd></div><div><dt>Billing Viewer</dt><dd>Separate tenant authority for billing. Does not grant project administration or request analytics.</dd></div></dl></details>
   <details><summary>What Can Each Operational Role Do?</summary><div className="administration-table-scroll" tabIndex={0} role="region" aria-label="Operational roles and permissions"><table className="administration-table roles-permissions-table"><thead><tr><th scope="col">Role</th><th scope="col">Visibility</th><th scope="col">Responsibilities</th></tr></thead><tbody>{[...new Set(ENROLLMENT_ROLES)].map(role=><tr key={role}><th scope="row">{roleLabel(role)}</th><td>{OPERATIONAL_ROLE_PROFILES[role].visibility}</td><td>{OPERATIONAL_ROLE_PROFILES[role].responsibilities}</td></tr>)}</tbody></table></div><p>Department Lead uses its assigned department and authorized Areas. Department title authority remains subject to the current assignment layer.</p></details>
   <details><summary>How Do Custom Roles Work?</summary><p>Tenant IT creates a name, chooses Viewer, Area Viewer, Department Manager or Subcontractor Coordinator, and optionally adds a description. The role is then available in member invitations and enrollment across all tenant projects.</p><p>The inherited type determines permissions. Area Viewer requires project Area assignments; Department Manager requires a project department membership. Until those assignments exist, the role has no request visibility. Role definitions do not grant access to anyone.</p></details>
   <details><summary>Which Responsibilities Need Separate Grants?</summary><p>Survey Reviewer grants authorize Area review. Company authority grants expand an eligible subcontractor Requester's company visibility. Staffing links and protected obligations remain separately reviewed.</p><p>Disabled tenant accounts or project access prevent use of their roles and grants.</p></details>
  </AdministrationDialog>}
 </div></Card>;
}
