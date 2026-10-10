'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { apiRequest } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { priorityLabel } from '@/lib/display-labels';
import { Button } from './button';
import { blockersFrom } from './action-blockers';
import { Card } from './card';
import { ErrorBanner, SuccessBanner } from './feedback';
import { useProjectWorkspace } from './project-shell-header';
import { ResizableTable, ResizableTh } from './resizable-table';

interface Department { id: string; name: string; managerTitle: string }
interface DepartmentTitle { id: string; title: string; defaultPriority: string; assignmentLayer: 'MANAGER' | 'SUPERINTENDENT' }

const PRIORITIES = ['NORMAL', 'MEDIUM', 'MED_HIGH', 'HIGH'] as const;

/**
 * Departments and their title catalog. Administrators can read them at any
 * time; they can be added or extended while the project is in Setup, matching
 * the server rule that setup structure locks at activation.
 */
export function ProjectDepartments({ projectId }: { projectId: string }) {
  const editable = useProjectWorkspace()?.project.status === 'SETUP';
  const [departments, setDepartments] = useState<Department[]>();
  const [titles, setTitles] = useState<Record<string, DepartmentTitle[]>>({});
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [managerTitle, setManagerTitle] = useState('');

  useEffect(() => {
    let active = true;
    setError(undefined);
    apiRequest<{ departments: Department[] }>(`/api/projects/${projectId}/departments`)
      .then(async result => {
        const entries = await Promise.all(result.departments.map(async department =>
          [department.id, (await apiRequest<{ titles: DepartmentTitle[] }>(`/api/projects/${projectId}/departments/${department.id}/titles`)).titles] as const));
        if (active) { setDepartments(result.departments); setTitles(Object.fromEntries(entries)); }
      })
      .catch(cause => { if (active) setError(getErrorMessage(cause, 'Unable to load departments. Try again.')); });
    return () => { active = false; };
  }, [projectId, revision]);

  async function send(path: string, body: Record<string, unknown>, message: string, reset: () => void) {
    if (busy) return;
    setBusy(true); setError(undefined); setSuccess(undefined);
    try {
      await apiRequest(path, { method: 'POST', body });
      reset(); setSuccess(message); setRevision(value => value + 1);
    } catch (cause) { setError(getErrorMessage(cause, 'Nothing was changed. Reload and try again.')); }
    finally { setBusy(false); }
  }

  function addDepartment(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !managerTitle.trim()) return;
    void send(`/api/projects/${projectId}/departments`, { name: name.trim(), managerTitle: managerTitle.trim() },
      `Department “${name.trim()}” added.`, () => { setName(''); setManagerTitle(''); });
  }

  return (
    <Card title="Departments" description="Functional groups such as QA/QC, Civil or Safety, with the titles people in them can hold.">
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        {!editable && departments ? <p className="notice">Departments and titles are locked after activation. They are shown here for reference.</p> : null}
        {!departments && !error ? <p className="muted" role="status">Loading departments…</p> : null}
        {departments && !departments.length ? <div className="empty-state"><strong>No departments yet</strong><span>{editable ? 'Add the first department below.' : 'None were set up for this project.'}</span></div> : null}
        {departments?.map(department => (
          <section key={department.id} className="department-card">
            <div className="toolbar"><h3 className="panel-title">{department.name}</h3><span className="muted">Head: {department.managerTitle}</span></div>
            {(titles[department.id] ?? []).length ? (
              <ResizableTable storageKey="department-titles" className="simple-table">
                <thead><tr><ResizableTh column="title" scope="col">Title</ResizableTh><ResizableTh column="layer" scope="col">Assigned by</ResizableTh><ResizableTh column="priority" scope="col">Default priority</ResizableTh></tr></thead>
                <tbody>{(titles[department.id] ?? []).map(title => (
                  <tr key={title.id}><td>{title.title}</td><td>{title.assignmentLayer === 'MANAGER' ? 'Department manager' : 'Superintendent'}</td><td>{priorityLabel(title.defaultPriority)}</td></tr>
                ))}</tbody>
              </ResizableTable>
            ) : <p className="muted">No titles yet.</p>}
            {editable ? <TitleForm busy={busy} onSubmit={(title, layer, priority, reset) => send(`/api/projects/${projectId}/departments/${department.id}/titles`,
              { title, assignmentLayer: layer, defaultPriority: priority }, `Title “${title}” added to ${department.name}.`, reset)} /> : null}
          </section>
        ))}
        {editable && departments ? (
          <form className="settings-item" onSubmit={addDepartment}>
            <div><h3>Add a department</h3><p className="muted">The head title is added to the department’s title catalog automatically.</p></div>
            <div className="row form-narrow">
              <label className="field" id="dp-name" style={{ flex: '1 1 14rem' }}><span className="field-label">Department name</span>
                <input className="input" value={name} maxLength={120} onChange={event => setName(event.target.value)} placeholder="For example: QA/QC" /></label>
              <label className="field" id="dp-head" style={{ flex: '1 1 14rem' }}><span className="field-label">Head title</span>
                <input className="input" value={managerTitle} maxLength={120} onChange={event => setManagerTitle(event.target.value)} placeholder="For example: QA/QC Manager" /></label>
              <Button type="submit" disabled={busy} blockedTitle="Can’t add the department yet" blockers={blockersFrom([[!name.trim(), 'Enter the department name.', 'dp-name'], [!managerTitle.trim(), 'Enter the head title, for example QA/QC Manager.', 'dp-head']])}>Add department</Button>
            </div>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

function TitleForm({ busy, onSubmit }: { busy: boolean; onSubmit: (title: string, layer: 'MANAGER' | 'SUPERINTENDENT', priority: string, reset: () => void) => void }) {
  const [title, setTitle] = useState('');
  const [layer, setLayer] = useState<'MANAGER' | 'SUPERINTENDENT'>('SUPERINTENDENT');
  const [priority, setPriority] = useState<string>('NORMAL');
  const titleId = useId();
  return (
    <form className="row title-form" onSubmit={event => { event.preventDefault(); if (title.trim()) onSubmit(title.trim(), layer, priority, () => setTitle('')); }}>
      <label className="field" id={titleId} style={{ flex: '2 1 12rem' }}><span className="field-label">New title</span>
        <input className="input" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} placeholder="For example: QA/QC Inspector" /></label>
      <label className="field" style={{ flex: '1 1 10rem' }}><span className="field-label">Assigned by</span>
        <select className="select" value={layer} onChange={event => setLayer(event.target.value as 'MANAGER' | 'SUPERINTENDENT')}>
          <option value="SUPERINTENDENT">Superintendent</option><option value="MANAGER">Department manager</option></select></label>
      <label className="field" style={{ flex: '1 1 9rem' }}><span className="field-label">Default priority</span>
        <select className="select" value={priority} onChange={event => setPriority(event.target.value)}>
          {PRIORITIES.map(value => <option key={value} value={value}>{priorityLabel(value)}</option>)}</select></label>
      <Button type="submit" variant="secondary" disabled={busy} blockedTitle="Can’t add the title yet" blockers={blockersFrom([[!title.trim(), 'Enter the title name.', titleId]])}>Add title</Button>
    </form>
  );
}
