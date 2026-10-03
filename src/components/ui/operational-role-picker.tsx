"use client";
import {useId} from 'react';
import {MEMBER_INVITATION_ROLES,type MemberInvitationRole} from '@/modules/tenancy/domain/member-invitation';
import {roleLabel} from '@/lib/display-labels';
import './operational-role-picker.css';
export function OperationalRolePicker({value,onChange,disabled,label='Operational Role'}:{value:string;onChange:(value:MemberInvitationRole)=>void;disabled?:boolean;label?:string}){
 const id=useId();
 return <label className="field" htmlFor={id}><span className="field-label">{label}</span><select id={id} className="select operational-role-list" size={5} value={value} disabled={disabled} onChange={e=>onChange(e.target.value as MemberInvitationRole)}>{MEMBER_INVITATION_ROLES.map(role=><option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>;
}
