'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiClient, apiRequest } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { AorLevelRecord, AorNodeRecord } from '@/lib/contracts';
import { Button } from './button';
import { blockersFrom } from './action-blockers';
import { Card } from './card';
import { ErrorBanner, SuccessBanner } from './feedback';
import { useProjectWorkspace } from './project-shell-header';

/**
 * Project Area structure (levels and Areas). Everyone with administration can
 * read it; levels and Areas can be added while the project is in Setup, matching
 * the server rule that structure locks at activation.
 */
export function ProjectAreaSetup({ projectId }: { projectId: string }) {
  const status = useProjectWorkspace()?.project.status;
  const editable = status === 'SETUP';
  const [tree, setTree] = useState<{ levels: AorLevelRecord[]; nodes: AorNodeRecord[] }>();
  const [revision, setRevision] = useState(0);
  const [treeOpen, setTreeOpen] = useState(true), [treeVersion, setTreeVersion] = useState(0);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [levelLabel, setLevelLabel] = useState('');
  const [nodeLevel, setNodeLevel] = useState('');
  const [nodeParent, setNodeParent] = useState('');
  const [nodeName, setNodeName] = useState('');
  const [nodeCode, setNodeCode] = useState('');

  useEffect(() => {
    let active = true;
    setError(undefined);
    apiClient.listAorTree(projectId).then(value => { if (active) setTree(value); })
      .catch(cause => { if (active) setError(getErrorMessage(cause, 'Unable to load the Area structure. Try again.')); });
    return () => { active = false; };
  }, [projectId, revision]);

  const levels = useMemo(() => [...(tree?.levels ?? [])].sort((a, b) => a.depth - b.depth), [tree]);
  const levelById = useMemo(() => new Map(levels.map(level => [level.id, level])), [levels]);
  const selectedLevel = levelById.get(nodeLevel);
  const parentChoices = (tree?.nodes ?? []).filter(node => selectedLevel && levelById.get(node.levelId)?.depth === selectedLevel.depth - 1);

  async function create(body: Record<string, unknown>, message: string, reset: () => void) {
    if (busy) return;
    setBusy(true); setError(undefined); setSuccess(undefined);
    try {
      await apiRequest(`/api/projects/${projectId}/aor`, { method: 'POST', body });
      reset(); setSuccess(message); setRevision(value => value + 1);
    } catch (cause) { setError(getErrorMessage(cause, 'The Area structure was not changed. Reload and try again.')); }
    finally { setBusy(false); }
  }

  function addLevel(event: FormEvent) {
    event.preventDefault();
    const label = levelLabel.trim();
    if (!label) return;
    void create({ kind: 'LEVEL', depth: levels.length, label }, `Level “${label}” added.`, () => setLevelLabel(''));
  }

  function addNode(event: FormEvent) {
    event.preventDefault();
    if (!selectedLevel || !nodeName.trim() || !nodeCode.trim()) return;
    void create({ kind: 'NODE', levelId: selectedLevel.id, parentId: selectedLevel.depth === 0 ? null : nodeParent || null, name: nodeName.trim(), code: nodeCode.trim().toUpperCase() },
      `Area “${nodeName.trim()}” added.`, () => { setNodeName(''); setNodeCode(''); });
  }

  function branch(parentId: string | null) {
    const children = (tree?.nodes ?? []).filter(node => node.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));
    if (!children.length) return null;
    return <ul className="area-tree">{children.map(node => {
      const label = <span className="area-node"><strong>{node.name}</strong> <span className="chip">{node.code}</span> <span className="muted">{levelById.get(node.levelId)?.label}</span></span>;
      const inner = branch(node.id);
      const count = (tree?.nodes ?? []).filter(item => item.parentId === node.id).length;
      // Branches collapse; the key re-mounts them when Expand all / Collapse all is chosen.
      return <li key={node.id}>{inner
        ? <details className="area-branch" open={treeOpen} key={`${node.id}:${treeVersion}`}><summary>{label} <span className="muted">· {count} inside</span></summary>{inner}</details>
        : label}</li>;
    })}</ul>;
  }
  const hasBranches = (tree?.nodes ?? []).some(node => node.parentId !== null);

  return (
    <Card title="Areas" description="The Area structure requesters choose from and survey staff are assigned to. Ticket numbers use the Area code.">
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        {!editable && status ? <p className="notice">{status === 'ACTIVE' ? 'The Area structure is locked after activation so existing requests and assignments stay consistent.' : 'Archived projects are read-only.'}</p> : null}
        {!tree && !error ? <p className="muted" role="status">Loading Areas…</p> : null}
        {tree ? (
          <div className="stack">
            <p className="section-label">Levels</p>
            {levels.length ? <ol className="area-levels">{levels.map(level => <li key={level.id}><span className="chip">{level.depth + 1}</span> {level.label}</li>)}</ol> : <p className="muted">No levels yet. Start with the top level, for example “Unit” or “General Area”.</p>}
            <p className="section-label">Areas</p>
            {hasBranches ? <div className="row"><button type="button" className="button button-secondary" onClick={() => { setTreeOpen(true); setTreeVersion(v => v + 1); }}>Expand all</button><button type="button" className="button button-secondary" onClick={() => { setTreeOpen(false); setTreeVersion(v => v + 1); }}>Collapse all</button></div> : null}
            {tree.nodes.length ? branch(null) : <p className="muted">No Areas yet.</p>}
          </div>
        ) : null}
        {editable && tree ? (
          <div className="settings-list">
            <form className="settings-item" onSubmit={addLevel}>
              <div><h3>Add a level</h3><p className="muted">Levels go from broadest to most specific. The next level is level {levels.length + 1}.</p></div>
              <div className="row form-narrow">
                <label className="field" id="as-level-name" style={{ flex: '1 1 16rem' }}><span className="field-label">Level name</span>
                  <input className="input" value={levelLabel} maxLength={60} onChange={event => setLevelLabel(event.target.value)} placeholder="For example: CWA" /></label>
                <Button type="submit" disabled={busy} blockers={blockersFrom([[!levelLabel.trim(), 'Enter the level name, for example Unit or CWA.', 'as-level-name']])} blockedTitle="Can’t add the level yet">Add level</Button>
              </div>
            </form>
            {levels.length ? (
              <form className="settings-item" onSubmit={addNode}>
                <div><h3>Add an Area</h3><p className="muted">Areas below the top level sit inside an Area from the level above.</p></div>
                <div className="stack form-narrow">
                  <label className="field" id="as-level"><span className="field-label">Level</span>
                    <select className="select" value={nodeLevel} onChange={event => { setNodeLevel(event.target.value); setNodeParent(''); }}>
                      <option value="">Choose a level</option>{levels.map(level => <option key={level.id} value={level.id}>{level.depth + 1}. {level.label}</option>)}
                    </select></label>
                  {selectedLevel && selectedLevel.depth > 0 ? (
                    <label className="field" id="as-parent"><span className="field-label">Inside</span>
                      <select className="select" value={nodeParent} onChange={event => setNodeParent(event.target.value)}>
                        <option value="">Choose the containing Area</option>{parentChoices.map(node => <option key={node.id} value={node.id}>{node.name} ({node.code})</option>)}
                      </select>
                      {!parentChoices.length ? <span className="muted field-help">Add an Area at the level above first.</span> : null}</label>
                  ) : null}
                  <div className="row">
                    <label className="field" id="as-area-name" style={{ flex: '2 1 14rem' }}><span className="field-label">Area name</span>
                      <input className="input" value={nodeName} maxLength={120} onChange={event => setNodeName(event.target.value)} placeholder="For example: CWA-1100 Pipe Rack" /></label>
                    <label className="field" id="as-area-code" style={{ flex: '1 1 8rem' }}><span className="field-label">Code</span>
                      <input className="input" value={nodeCode} maxLength={20} onChange={event => setNodeCode(event.target.value.replace(/[^A-Za-z0-9]/g, ''))} placeholder="N1100" /></label>
                  </div>
                  <span className="muted field-help">The code appears in request numbers, for example FSS-{nodeCode.trim().toUpperCase() || 'N1100'}-00042.</span>
                  <Button type="submit" disabled={busy} blockedTitle="Can’t add the Area yet" blockers={blockersFrom([
                    [!selectedLevel, 'Choose the level this Area belongs to.', 'as-level'],
                    [!!selectedLevel && selectedLevel.depth > 0 && !nodeParent, 'Choose the Area it sits inside.', 'as-parent'],
                    [!nodeName.trim(), 'Enter the Area name.', 'as-area-name'],
                    [!nodeCode.trim(), 'Enter a short code; it appears in request numbers.', 'as-area-code'],
                  ])}>Add Area</Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
