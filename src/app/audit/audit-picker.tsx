'use client';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../ui/api';

export interface Choice { value: string; label: string }
export function AuditPicker({ kind, label, value, onChange }: {
  kind: 'projects' | 'actors' | 'events'; label: string;
  value: Choice | null; onChange: (value: Choice | null) => void;
}) {
  const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[offset,setOffset]=useState(0);
  const [page,setPage]=useState<{options:Choice[];hasMore:boolean}|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    if(!open)return;
    let current=true;setPage(null);setError('');
    api<{options:Choice[];hasMore:boolean}>(`/api/audit?${new URLSearchParams({options:kind,search,limit:'20',offset:String(offset)})}`)
      .then(result=>{if(current)setPage(result);}).catch(cause=>{if(current)setError(errorMessage(cause));});
    return ()=>{current=false;};
  },[kind,search,offset,open]);
  return <div>
    <p><strong>{label}</strong><br/>{value?.label ?? 'All'}</p>
    <div className="actions"><button type="button" className="secondary" aria-expanded={open} onClick={()=>setOpen(!open)}>Choose {label.toLowerCase()}</button>
      {value && <button type="button" className="secondary" onClick={()=>onChange(null)}>Clear {label.toLowerCase()}</button>}</div>
    {open && <section className="panel" aria-label={`${label} choices`}>
      <label className="field">Search {label.toLowerCase()}<input value={search} maxLength={200} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></label>
      {error && <p role="alert">{error}</p>}
      {!page && !error && <p role="status">Loading choices…</p>}
      {page && <><div className="actions">{page.options.map(option=><button type="button" className="secondary" key={option.value}
        onClick={()=>{onChange(option);setOpen(false);}}>{option.label}</button>)}</div>
        {!page.options.length && <p>No matching choices.</p>}
        <div className="actions"><button type="button" className="secondary" disabled={offset===0} onClick={()=>setOffset(offset-20)}>Previous choices</button>
          <button type="button" className="secondary" disabled={!page.hasMore} onClick={()=>setOffset(offset+20)}>Next choices</button></div></>}
    </section>}
  </div>;
}
