'use client';
import Link from 'next/link';
import {Icon} from '@/components/ui/icon';
import {useProjectWorkspace} from '@/components/ui/project-shell-header';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import {useEffect,useRef,useState} from 'react';
import {Button,Card,ErrorBanner,SuccessBanner} from '@/components/ui';
import {AdministrationSection} from '@/components/ui/administration-records';
import {applyAppearance} from '@/components/ui/appearance-theme';
import type {Appearance,DisplayMode} from '@/modules/identity/application/appearance';
export default function AppearancePage(){
 const workspace=useProjectWorkspace();
 const [returnTo,setReturnTo]=useState<string>();
 useEffect(()=>{const candidate=new URLSearchParams(window.location.search).get('returnTo');if(candidate&&/^\/(?:projects(?:[/?]|$)|profile(?:[?]|$)|assignment-details(?:[?]|$))/.test(candidate))setReturnTo(candidate);},[]);
 const [data,setData]=useState<Appearance>(),[mode,setMode]=useState<DisplayMode>('SYSTEM'),[primary,setPrimary]=useState('#315f85'),[accent,setAccent]=useState('#ffa500'),[busy,setBusy]=useState(false),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>(),[stale,setStale]=useState(false);
 const attempt=useRef<{key:string;body:unknown}|undefined>(undefined);
 function accept(value:Appearance){setData(value);setMode(value.mode);setPrimary(value.branding.primary);setAccent(value.branding.accent);applyAppearance(value);window.dispatchEvent(new CustomEvent('swr-appearance',{detail:value}));}
 async function load(){setError(undefined);try{const r=await fetch('/api/account/appearance',{cache:'no-store'});const value=await r.json();if(!r.ok)throw new Error(value.error?.message??'Unable to load appearance.');accept(value);attempt.current=undefined;setStale(false);}catch(e){setError(e instanceof Error?e.message:'Unable to load appearance.');}}
 useEffect(()=>{void load();},[]);
 async function save(scope:'PERSONAL'|'TENANT'){
  if(!data||busy||stale)return;setBusy(true);setError(undefined);setSuccess(undefined);
  attempt.current??={key:crypto.randomUUID(),body:scope==='PERSONAL'?{scope,mode}:{scope,primary,accent,version:data.branding.version}};
  try{const r=await fetch('/api/account/appearance',{method:'PUT',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.current.key},body:JSON.stringify(attempt.current.body)}),value=await r.json();if(!r.ok){if(r.status<500){attempt.current=undefined;setStale(true);}throw new Error(value.error?.message??'Unable to save appearance.');}accept(value);attempt.current=undefined;setSuccess(scope==='PERSONAL'?'Your display preference is saved.':'Tenant branding is saved for every account in this tenant.');}
  catch(e){setError(e instanceof Error?e.message:'The response is uncertain. Retry the unchanged setting.');}finally{setBusy(false);}
 }
 useUnsavedProgress(busy||!!attempt.current);
 const locked=busy||!!attempt.current||stale;
 return <div className="stack appearance-page"><div><Link className="app-link" href={returnTo??(workspace?`/projects/${workspace.project.id}/home`:'/projects')}><Icon name="back"/>Back</Link></div><Card title="Appearance" description="Choose how SWRTracker looks for your account. This preference follows your account. Company branding is shared across your tenant."><div className="stack">
 {!data&&!error?<p role="status">Loading appearance…</p>:null}{error?<ErrorBanner message={error}/>:null}{success?<SuccessBanner message={success}/>:null}
 {data?<><fieldset disabled={locked} className="appearance-modes"><legend>Display Mode</legend>{(['LIGHT','DARK','SYSTEM'] as DisplayMode[]).map(value=><label key={value}><input type="radio" name="display-mode" value={value} checked={mode===value} onChange={()=>setMode(value)}/><span>{value==='SYSTEM'?'Use device setting':value==='DARK'?'Dark':'Light'}</span></label>)}</fieldset><Button disabled={busy||stale||!!attempt.current} onClick={()=>void save('PERSONAL')}>Save display mode</Button></>:null}
 {!!attempt.current&&!busy?<Button onClick={()=>void save((attempt.current!.body as {scope:'PERSONAL'|'TENANT'}).scope)}>Retry unchanged setting</Button>:null}
 {stale||!data?<Button variant="secondary" disabled={busy} onClick={()=>void load()}>Reload appearance</Button>:null}
 </div></Card>
 {data?.canBrand?<Card title="Company Branding" description="Central IT controls colors for this tenant. Text and action colors are adjusted for readable contrast in both modes. Safety status colors retain their meaning."><AdministrationSection title="Customize Tenant Colors" open locked={locked}><div className="appearance-colors"><label className="field"><span className="field-label">Primary company color</span><input aria-label="Primary company color" type="color" value={primary} disabled={locked} onChange={e=>setPrimary(e.target.value)}/><span>{primary}</span></label><label className="field"><span className="field-label">Accent company color</span><input aria-label="Accent company color" type="color" value={accent} disabled={locked} onChange={e=>setAccent(e.target.value)}/><span>{accent}</span></label></div><div className="row"><Button disabled={locked} onClick={()=>void save('TENANT')}>Save tenant branding</Button><Button variant="secondary" disabled={locked} onClick={()=>{setPrimary('#315f85');setAccent('#ffa500');}}>Choose Axiom defaults</Button></div></AdministrationSection></Card>:null}
 </div>;
}
