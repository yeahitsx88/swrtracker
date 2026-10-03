'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import {Button,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import {Field} from '@/components/forms';
import {AdministrationDialog} from './administration-dialog';
import {AdministrationRecords} from './administration-records';

export type RegisteredCompany={id:string;name:string;type:string};
type Company=RegisteredCompany;
const typeNames:Record<string,string>={GC:'General contractor',SUBCONTRACTOR:'Subcontractor',OWNER_REP:'Owner representative'};
export function CompanyRegistration({projectId,owner,disabled,onDone,continuation}:{projectId:string;owner:CommandOwner;disabled:boolean;onDone:()=>void;
  continuation?:{token:string;onReturn:(company?:RegisteredCompany)=>void}}) {
  const token=continuation?.token??'company-registration',endpoint=`/api/projects/${projectId}/companies`;
  useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
  const gate=useRef(new FrozenCommand<Record<string,unknown>>()).current;
  const [open,setOpen]=useState(!!continuation),[mode,setMode]=useState<'new'|'existing'|undefined>(continuation?'new':undefined),[step,setStep]=useState(0);
  const [name,setName]=useState(''),[type,setType]=useState(continuation?'GC':'SUBCONTRACTOR'),[selected,setSelected]=useState<Company>();
  const [search,setSearch]=useState(''),[offset,setOffset]=useState(0),[directory,setDirectory]=useState<{directory:Company[];total:number}>();
  const [loading,setLoading]=useState(false),[error,setError]=useState<string>(),[result,setResult]=useState<Company>(),[consent,setConsent]=useState(false),[,render]=useState(0);
  const blocked=disabled||owner.blocked(token),locked=blocked||gate.locked;
  useUnsavedProgress(gate.locked);
  useEffect(()=>{
    if(!open||mode!=='existing'||step!==0)return;
    let current=true;setLoading(true);
    const timer=setTimeout(()=>void apiRequest<{directory:Company[];total:number}>(`${endpoint}?directory=true&limit=25&offset=${offset}&search=${encodeURIComponent(search)}`)
      .then(value=>{if(current){setDirectory(value);setError(undefined);}}).catch(cause=>{if(current)setError(getErrorMessage(cause,'Unable to find companies. Try the search again.'));}).finally(()=>{if(current)setLoading(false);}),200);
    return()=>{current=false;clearTimeout(timer);};
  },[endpoint,open,mode,step,offset,search]);
  function close(){if(blocked||!gate.reload())return;if(continuation){continuation.onReturn(result);return;}owner.release(token);setOpen(false);setMode(undefined);setStep(0);setError(undefined);setResult(undefined);setConsent(false);}
  function start(){if(blocked||!owner.claim(token))return;setOpen(true);setMode(undefined);setStep(0);setName('');setSelected(undefined);setSearch('');setOffset(0);setError(undefined);setResult(undefined);setConsent(false);}
  async function submit(){
    if(blocked||!consent||!owner.claim(token))return;
    const body=mode==='new'?{name:name.trim(),type,confirmed:true}:{companyId:selected?.id,confirmed:true};
    const frozen=gate.begin(body,crypto.randomUUID());if(!frozen)return;render(n=>n+1);setError(undefined);
    try {const value=await apiRequest<{company:Company}>(endpoint,{method:'POST',body:frozen.body,headers:{'Idempotency-Key':frozen.key}});gate.success();setResult(value.company);onDone();}
    catch(cause){gate.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The outcome is uncertain. Retry this same company action.'));}
    finally {render(n=>n+1);}
  }
  const reviewStep=mode==='new'?2:1;
  const nextEnabled=mode==='new'?step===0?!!name.trim():true:!!selected;
  return <>{!continuation&&<Button variant="secondary" disabled={blocked||owner.snapshot()!==null} onClick={start}>Register or associate a company</Button>}
    {open&&<AdministrationDialog title={result?'Company ready':!mode?'Register or associate a company':mode==='new'?'New company registration':'Associate an existing company'}
      step={mode?{current:result?reviewStep+2:step+1,total:reviewStep+2,label:result?'Complete':step===reviewStep?'Review':mode==='new'?step===0?'Company name':'Company type':'Find company'}:undefined}
      closeDisabled={blocked||gate.pending||!!gate.command&&!gate.stale} onClose={close}
      footer={result?<Button onClick={close}>{continuation?'Use company and return to invitation':'Close'}</Button>:mode?<><Button variant="secondary" disabled={blocked||gate.pending||!!gate.command&&!gate.stale} onClick={close}>{continuation?'Return to invitation':'Cancel'}</Button><div className="row">
        {(!continuation||step>0)&&<Button variant="secondary" disabled={locked} onClick={()=>{setConsent(false);setStep(n=>Math.max(0,n-1));if(step===0)setMode(undefined);}}>Back</Button>}
        {step<reviewStep?<Button disabled={locked||loading||!nextEnabled} onClick={()=>{setError(undefined);setStep(n=>n+1);}}>Next</Button>:<Button disabled={blocked||gate.pending||gate.stale||!consent} onClick={()=>void submit()}>{gate.pending?'Saving…':gate.command?'Retry same action':mode==='new'?'Create company':'Associate company'}</Button>}
      </div></>:<Button variant="secondary" onClick={close}>Cancel</Button>}>
      {error&&<ErrorBanner message={error}/>} {gate.stale&&<><p role="alert">State changed. Reload this flow and review the current company.</p><Button variant="secondary" onClick={()=>{if(gate.reload()){setStep(0);setConsent(false);setError(undefined);render(n=>n+1);}}}>Reload company flow</Button></>}
      {result?<><SuccessBanner message={`${result.name} ${mode==='new'?'created and associated':'associated'} with this project.`}/><dl className="administration-dialog-summary"><div><dt>Company name</dt><dd>{result.name}</dd></div><div><dt>Company type</dt><dd>{typeNames[result.type]}</dd></div><div><dt>Company reference</dt><dd>{result.id}</dd></div></dl><p>The company is ready for project enrollment. Creating a company does not create an employee account or grant another project’s access.</p></>:!mode?<><p>Register a new company, or choose a company already in this tenant. Both actions associate it with this project.</p><div className="row"><Button onClick={()=>setMode('new')}>Register new company</Button><Button variant="secondary" onClick={()=>setMode('existing')}>Choose existing company</Button></div></>:<>
        {mode==='new'&&step===0&&<Field label="Company name"><Input value={name} maxLength={200} disabled={locked} onChange={e=>setName(e.target.value)}/></Field>}
        {mode==='new'&&step===1&&<><p>Choose how {name.trim()} participates in the project.</p>{continuation&&<p className="muted">Project Admin candidates must belong to a general contractor or owner representative company.</p>}<Field label="Company type"><select className="select" value={type} disabled={locked} onChange={e=>setType(e.target.value)}>{Object.entries(typeNames).filter(([value])=>!continuation||value!=='SUBCONTRACTOR').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field></>}
        {mode==='existing'&&step===0&&<><Field label="Find a company by name"><Input value={search} maxLength={100} disabled={locked} onChange={e=>{setSearch(e.target.value);setOffset(0);setSelected(undefined);}}/></Field>{loading&&<p role="status">Finding companies…</p>}
          <AdministrationRecords picker label="companies on this page" rows={directory?.directory??[]} id={c=>c.id} disabled={locked||loading} columns={[{key:'name',label:'Company',text:c=>c.name},{key:'type',label:'Company type',text:c=>typeNames[c.type]??c.type}]}
            actions={c=><Button variant="secondary" disabled={locked||loading} aria-pressed={selected?.id===c.id} onClick={()=>setSelected(c)}>{selected?.id===c.id?'Selected':'Choose company'}</Button>}/>
          <div className="row"><Button variant="secondary" disabled={locked||loading||offset===0} onClick={()=>{setOffset(n=>Math.max(0,n-25));setSelected(undefined);}}>Previous company page</Button><Button variant="secondary" disabled={locked||loading||(directory?.directory.length??0)<25||offset+25>=(directory?.total??0)} onClick={()=>{setOffset(n=>n+25);setSelected(undefined);}}>Next company page</Button></div></>}
        {step===reviewStep&&<><dl className="administration-dialog-summary"><div><dt>Company name</dt><dd>{mode==='new'?name.trim():selected?.name}</dd></div><div><dt>Company type</dt><dd>{typeNames[mode==='new'?type:selected?.type??'']}</dd></div><div><dt>Scope</dt><dd>This project. Access to other projects is unchanged.</dd></div></dl><label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this company and project association.</span></label></>}
      </>}
    </AdministrationDialog>}
  </>;
}
