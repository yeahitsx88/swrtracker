'use client';
import {HeadingHelp} from '@/components/ui/heading-help';
import {RecordCollection} from '@/components/ui/record-collection';
import {useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {FrozenCommand,CommandOwner} from '@/lib/frozen-command';
import {Button,ErrorBanner,SuccessBanner} from '@/components/ui';
export interface AdministrationAction{url:string;method:'POST'|'DELETE'|'PATCH';body:Record<string,unknown>;label:string}
export function AdministrationBatch({actions,owner,onDone,onCancel}:{actions:AdministrationAction[];owner:CommandOwner;onDone:()=>void;onCancel:()=>void}){
 const gate=useRef(new FrozenCommand<Array<AdministrationAction&{key:string}>>()).current,progress=useRef(0),token='administration-batch';
 const ownerToken=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const [consent,setConsent]=useState(false),[error,setError]=useState<string>(),[done,setDone]=useState(false),[reloadRequired,setReloadRequired]=useState(false),[,render]=useState(0);
 async function submit(){if(!consent||reloadRequired||!owner.claim(token))return;const frozen=gate.begin(actions.map(a=>({...a,key:crypto.randomUUID()})),crypto.randomUUID());if(!frozen)return;render(v=>v+1);setError(undefined);
  try{while(progress.current<frozen.body.length){const a=frozen.body[progress.current]!;await apiRequest(a.url,{method:a.method,body:a.body,headers:{'Idempotency-Key':a.key}});progress.current++;render(v=>v+1);}gate.success();setDone(true);onDone();}
  catch(cause){const status=cause instanceof ApiClientError?cause.status:undefined;gate.fail(status);if(status!==undefined&&status<500){setReloadRequired(true);gate.stale=true;}setError(getErrorMessage(cause,'Outcome uncertain. Retry the unchanged remaining actions.'));}
  finally{if(!gate.locked)owner.release(token);render(v=>v+1);}
 }
 return <section className="stack" aria-label="Review selected actions"><HeadingHelp label={"Review Selected Actions"} heading={<h3 className="panel-title">Review Selected Actions</h3>} help={<span>Each person is checked and saved separately. If an action fails, completed changes remain and processing stops. Access and operational roles follow the existing project rules.</span>}/><RecordCollection label="reviewed actions" records={<>{actions.map((a,i)=><li key={i}>{a.label}{i<progress.current?' · Completed':''}</li>)}</>}/>{error&&<ErrorBanner message={error}/>}<p role="status">{progress.current} of {actions.length} completed</p>{done?<SuccessBanner message="Selected actions completed. Affected permission changes require renewed sign-in."/>:<><label className="checkbox-row"><input type="checkbox" checked={consent} disabled={gate.locked||ownerToken!==null&&ownerToken!==token} onChange={e=>setConsent(e.target.checked)}/><span>I confirm each listed project action.</span></label><Button disabled={!consent||gate.pending||reloadRequired||owner.blocked(token)} onClick={()=>void submit()}>{gate.pending?'Applying actions…':gate.command?'Retry unchanged remaining actions':'Confirm selected actions'}</Button></>}{reloadRequired&&<p role="alert">Reload current records before selecting another action.</p>}<Button variant="secondary" disabled={gate.pending||!!gate.command&&!gate.stale||owner.blocked(token)} onClick={()=>{if(gate.reload()){owner.release(token);onCancel();}}}>{done||reloadRequired?'Reload records':'Cancel selected actions'}</Button></section>;
}
