'use client';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, jsonBody } from '@/app/ui/api';
interface Candidate { id:string; name:string }
function PickupPicker({endpoint,kind,label,value,onChange,disabled}:{endpoint:string;kind:'tickets'|'crew';label:string;
  value:Candidate|null;onChange:(value:Candidate)=>void;disabled:boolean}) {
  const [text,setText]=useState('');const [search,setSearch]=useState('');const [offset,setOffset]=useState(0);
  const [page,setPage]=useState<{candidates:Candidate[];hasMore:boolean}|null>(null);const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{let current=true;setPage(null);setError('');
    api<{candidates:Candidate[];hasMore:boolean}>(endpoint+'&kind='+kind+'&search='+encodeURIComponent(search)+'&limit=20&offset='+offset)
      .then(result=>{if(current)setPage(result);}).catch(cause=>{if(current)setError(errorMessage(cause));});
    return()=>{current=false;};
  },[endpoint,kind,search,offset,revision]);
  return <fieldset disabled={disabled} style={{marginBottom:16,padding:16,border:'1px solid #ccd4d8',borderRadius:8}}><legend>{label}</legend>
    <p>Selected: {value?.name ?? 'None'}</p>
    <label className="field">Search {label}<input value={text} maxLength={200} onChange={e=>setText(e.target.value)}/></label>
    <button className="secondary" onClick={()=>{setSearch(text.trim());setOffset(0);setRevision(n=>n+1);}}>Search {label}</button>
    {error && <p role="alert" className="notice error">{error}</p>}
    {!page && !error && <p role="status">Loading choices…</p>}
    {page && <><div className="actions">{page.candidates.map(item=><button className="secondary" key={item.id} aria-pressed={value?.id===item.id} onClick={()=>onChange(item)}>{item.name}</button>)}</div>
      {!page.candidates.length && <p>No eligible matches. Try another search or refresh the help board.</p>}
      {(offset>0 || page.hasMore) && <div className="actions"><button disabled={!offset} onClick={()=>setOffset(offset-20)}>Previous {label}</button>
        <span>Page {offset/20+1}</span><button disabled={!page.hasMore} onClick={()=>setOffset(offset+20)}>Next {label}</button></div>}</>}
  </fieldset>;
}
export function HelpPickup({projectId,flagId,onBusyChange,onDone,onBack}:{projectId:string;flagId:string;
  onBusyChange:(busy:boolean)=>void;onDone:()=>void;onBack:()=>void}){
  const [ticket,setTicket]=useState<Candidate|null>(null);const [crew,setCrew]=useState<Candidate|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const inFlight=useRef(false);
  const endpoint=`/api/projects/${projectId}/help-flags`;
  async function claim(){if(inFlight.current)return;if(!ticket || !crew){setError('Select a request and an Instrument Man.');return;}
    inFlight.current=true;setBusy(true);onBusyChange(true);setError('');
    try{await api(endpoint,jsonBody({action:'claim',flagId,ticketId:ticket.id,instrumentManId:crew.id}));onDone();}
    catch(cause){setError(errorMessage(cause));}
    finally{inFlight.current=false;setBusy(false);onBusyChange(false);}
  }
  return <section className="panel"><h2>Pick up flagged work</h2><p>Choose a request and an Instrument Man from your crew. Confirming transfers the request to you as Party Chief.</p>
    <PickupPicker endpoint={endpoint+'?flagId='+flagId} kind="tickets" label="Request" value={ticket} onChange={setTicket} disabled={busy}/>
    <PickupPicker endpoint={endpoint+'?flagId='+flagId} kind="crew" label="Instrument Man" value={crew} onChange={setCrew} disabled={busy}/>
    {error && <p role="alert" className="notice error">{error}</p>}
    <div className="actions"><button disabled={busy} onClick={()=>void claim()}>{busy?'Claiming…':'Confirm pickup'}</button>
      <button className="secondary" disabled={busy} onClick={onBack}>Back</button></div>
  </section>;
}
