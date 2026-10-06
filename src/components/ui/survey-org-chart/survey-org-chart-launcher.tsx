'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../button';
import { Icon } from '../icon';
import { SurveyOrgChartWorkspace } from './survey-org-chart-workspace';
import './survey-org-chart-overlay.css';

function SurveyOrgChartOverlay({ onDismiss }: { onDismiss: () => void }) {
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
      <h2 id={heading} tabIndex={-1} autoFocus>Survey Organization Chart · Demo</h2>
      <Button variant="secondary" className="icon-close" aria-label="Close organization chart" onClick={onDismiss}><Icon name="close" /></Button>
    </div>
    <div className="survey-org-chart-overlay-body"><SurveyOrgChartWorkspace /></div>
  </dialog>;
}

/** Fixture-only workspace: never reads or mutates operational staffing. */
export function SurveyOrgChartLauncher({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>Open Survey Organization Chart (Demo)</Button>
    {open && <SurveyOrgChartOverlay onDismiss={() => setOpen(false)} />}
  </>;
}
