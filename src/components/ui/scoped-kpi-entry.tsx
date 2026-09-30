'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { Button } from './button';
import type { KpiAudience } from './kpi-explorer';
import './scoped-kpi-entry.css';
import './popout.css';

const KpiExplorer = dynamic(() => import('./kpi-explorer').then(module => module.KpiExplorer), {
  loading: () => <p role="status">Loading request charts…</p>,
});

export function ScopedKpiEntry({ projectId, audience }: { projectId: string; audience: Extract<KpiAudience, 'requester' | 'field'> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const requester = audience === 'requester';
  return <>
    <section className="kpi-entry" aria-label={requester ? 'Request trends' : 'Crew work trends'}>
      <div><strong>{requester ? 'Request trends' : 'Crew work trends'}</strong><p className="muted">Explore counts, status and turnaround for requests in your access scope.</p></div>
      <Button variant="secondary" onClick={() => { setOpened(true); dialog.current?.showModal(); }} aria-haspopup="dialog">Explore charts</Button>
    </section>
    <dialog ref={dialog} className="kpi-entry-dialog popout-dialog" aria-label={requester ? 'Explore request trends' : 'Explore crew work trends'} onClose={() => setOpened(false)}>
      <div className="kpi-entry-heading popout-header"><h2>{requester ? 'Explore request trends' : 'Explore crew work trends'}</h2><Button variant="secondary" onClick={() => dialog.current?.close()}>Close</Button></div>
      <div className="popout-body">{opened ? <KpiExplorer projectId={projectId} initialMeasure={requester ? 'all' : 'open'} audience={audience} /> : null}</div>
    </dialog>
  </>;
}
