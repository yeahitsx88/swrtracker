'use client';
import {useEffect,useState} from 'react';
import type {CommandOwner} from '@/lib/frozen-command';
import {apiRequest} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import {Button,ErrorBanner} from '@/components/ui';
import type {RegisteredCompany} from './company-registration';
export function HomeOrganization(_props:{owner?:CommandOwner;disabled?:boolean;onDone?:()=>void}={}){
 const [company,setCompany]=useState<RegisteredCompany|null>(),[error,setError]=useState<string>(),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;apiRequest<{company:RegisteredCompany|null}>('/api/tenant/home-organization').then(value=>{if(active){setCompany(value.company);setError(undefined);}}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to load your account organization.'));});return()=>{active=false;};},[revision]);
 return <div className="stack">{error?<><ErrorBanner message={error}/><Button variant="secondary" onClick={()=>setRevision(n=>n+1)}>Retry Organization Details</Button></>:company===undefined?<p role="status">Loading account organization…</p>:company?<dl className="administration-dialog-summary"><div><dt>Tenant Company</dt><dd>{company.name}</dd></div><div><dt>Company Type</dt><dd>{company.type==='GC'?'General Contractor':'Owner Representative'}</dd></div></dl>:<p role="status">The account organization has not been provisioned. Contact Axiom customer support.</p>}<p className="muted">Axiom establishes this organization when your tenant account is created. Contact Axiom customer support for a rebrand or account change.</p></div>;
}
