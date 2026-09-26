'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage, jsonBody } from '@/app/ui/api';
import { Shell } from '@/app/ui/shell';
interface Flag { id: string; level: 1 | 2; reason: string | null; affectedTicketIds: string[];
  own: boolean; canClear: boolean; canEscalate: boolean }
interface Board { flags: Flag[]; raiseLevel: 1 | 2 | null }
export function HelpBoard({ projectId }: { projectId: string }) {
  const [board,setBoard]=useState<Board | null>(null);
  const [error,setError]=useState('');
  const [authNeeded,setAuthNeeded]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const [reason,setReason]=useState('');
  const [action,setAction]=useState<{ kind:'raise'|'clear'|'escalate'; flagId?:string } | null>(null);
  const inFlight=useRef(false);
  const endpoint=`/api/projects/${projectId}/help-flags`;
  useEffect(()=>{
    let current=true;setLoading(true);setError('');
    api<Board>(endpoint).then(result=>{if(current){setBoard(result);setAuthNeeded(false);}})
      .catch(cause=>{if(current){setBoard(null);setError(errorMessage(cause));setAuthNeeded(cause instanceof ApiError && cause.status===401);}})
      .finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[endpoint,revision]);
  async function submit(){
    if(!action || inFlight.current || loading)return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      await api(endpoint,jsonBody({action:action.kind,flagId:action.flagId,
        level:action.kind==='raise' ? board?.raiseLevel : undefined,
        reason:action.kind==='clear' ? undefined : reason}));
      setAction(null);setReason('');setRevision(n=>n+1);
    }catch(cause){setError(errorMessage(cause));}
    finally{inFlight.current=false;setBusy(false);}
  }
  function choose(kind:'raise'|'clear'|'escalate',flagId?:string){setAction({kind,flagId});setReason('');setError('');}
  return <Shell projectId={projectId} signedIn={Boolean(board)}>
    <p className="eyebrow">Crew coordination</p><h1>Help flags</h1>
    <p>Level 1 requests stay within the crew. Level 2 requests are visible to Party Chiefs and survey supervisors across the project.</p>
    {loading && <p role="status">Loading help flags…</p>}
    {error && <div className="notice error" role="alert">{error}{authNeeded && <p><Link href={`/login?next=${encodeURIComponent('/project/'+projectId+'/help')}`}>Sign in to view help flags</Link></p>}</div>}
    {board && !loading && <>
      <div className="actions">{board.raiseLevel && <button disabled={busy || Boolean(action)} onClick={()=>choose('raise')}>Raise Level {board.raiseLevel} help flag</button>}
        <button className="secondary" disabled={busy || Boolean(action)} onClick={()=>setRevision(n=>n+1)}>Refresh help flags</button></div>
      {action && <section className="panel"><h2>{action.kind==='clear' ? 'Clear your help flag' : action.kind==='escalate' ? 'Escalate to Level 2' : 'Request help'}</h2>
        <p>{action.kind==='clear' ? 'Confirm that you no longer need this help flag.' : action.kind==='escalate' ? 'This raises a project-wide flag for your crew workload.' : 'Describe the support your crew needs. The current assigned workload is recorded with this flag.'}</p>
        {action.kind!=='clear' && <label className="field">Reason (optional)<textarea maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} /></label>}
        <div className="actions"><button disabled={busy} onClick={()=>void submit()}>{busy ? 'Saving…' : 'Confirm'}</button>
          <button className="secondary" disabled={busy} onClick={()=>{setAction(null);setError('');}}>Back</button></div>
      </section>}
      <section className="panel" aria-label="Active help flags">
        {!board.flags.length && <p>No active help flags are visible to you.</p>}
        {board.flags.map(flag=><article className="record" key={flag.id}>
          <h2>{flag.own ? 'Your' : 'Crew'} Level {flag.level} help flag</h2>
          <p className="description">{flag.reason || 'No reason provided.'}</p>
          <p>{flag.affectedTicketIds.length} requests in the recorded workload visible to you.</p>
          <div className="actions">{flag.canClear && <button className="secondary" disabled={busy || Boolean(action)} onClick={()=>choose('clear',flag.id)}>Clear flag</button>}
            {flag.canEscalate && <button disabled={busy || Boolean(action)} onClick={()=>choose('escalate',flag.id)}>Escalate to Level 2</button>}</div>
        </article>)}
      </section>
    </>}
    <p><Link href={`/project/${projectId}/requests`}>Project requests</Link></p>
  </Shell>;
}
