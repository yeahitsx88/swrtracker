'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../button';
import { Icon } from '../icon';
import { SurveyOrgChartWorkspace } from './survey-org-chart-workspace';
import { LiveSurveyOrgChart } from './live-survey-org-chart';
import './survey-org-chart-overlay.css';

function SurveyOrgChartOverlay({ projectId, onDismiss }: { projectId?: string; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => { node?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="survey-org-chart-overlay" aria-labelledby={heading} onCancel={event => {
    // A nested move-review Escape belongs to that review, not this workspace.
    if (event.target !== event.currentTarget) return;
    event.preventDefault(); onDismiss();
  }}>
    <div className="survey-org-chart-overlay-heading">
      <h2 id={heading} tabIndex={-1} autoFocus>Survey Organization Chart · {projectId ? 'Read-Only' : 'Demo'}</h2>
      <Button variant="secondary" className="icon-close" aria-label="Close organization chart" onClick={onDismiss}><Icon name="close" /></Button>
    </div>
    <div className="survey-org-chart-overlay-body"><>{projectId ? <LiveSurveyOrgChart key={projectId} projectId={projectId} /> : <SurveyOrgChartWorkspace />}</></div>
  </dialog>;
}

/** Operational launches read the current project; standalone previews retain fixtures. No writes. */
export function SurveyOrgChartLauncher({ projectId, disabled = false }: { projectId?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>Open Survey Organization Chart ({projectId ? 'Read-Only' : 'Demo'})</Button>
    {open && <SurveyOrgChartOverlay projectId={projectId} onDismiss={() => setOpen(false)} />}
  </>;
}
