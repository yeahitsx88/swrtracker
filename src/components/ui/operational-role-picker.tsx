"use client";
import {useId} from 'react';
import {MEMBER_INVITATION_ROLES,type MemberInvitationRole} from '@/modules/tenancy/domain/member-invitation';
import {roleLabel} from '@/lib/display-labels';
import type {CustomRole} from '@/modules/tenancy/domain/custom-role';
import './operational-role-picker.css';
export function OperationalRolePicker({value,onChange,disabled,label='Operational Role',customRoles=[],customRoleId,onCustomRoleChange}:{value:string;onChange:(value:MemberInvitationRole)=>void;disabled?:boolean;label?:string;customRoles?:CustomRole[];customRoleId?:string;onCustomRoleChange?:(id:string|undefined)=>void}){
 const id=useId();
 return <label className="field" htmlFor={id}><span className="field-label">{label}</span><select id={id} className="select operational-role-list" size={5} value={customRoleId?`custom:${customRoleId}`:value} disabled={disabled} onChange={e=>{
  const selected=customRoles.find(r=>`custom:${r.id}`===e.target.value);
  if(selected){onChange(selected.baseRole);onCustomRoleChange?.(selected.id);}else{onChange(e.target.value as MemberInvitationRole);onCustomRoleChange?.(undefined);}
 }}><optgroup label="Built-in Permission Profiles">{MEMBER_INVITATION_ROLES.map(role=><option key={role} value={role}>{roleLabel(role)}</option>)}</optgroup>{!!customRoles.length&&onCustomRoleChange&&<optgroup label="Tenant Custom Roles">{customRoles.map(role=><option key={role.id} value={`custom:${role.id}`}>{role.name} · {roleLabel(role.baseRole)}</option>)}</optgroup>}</select></label>;
}
