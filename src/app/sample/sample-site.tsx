'use client';

import { useState, type FormEvent } from 'react';

type Status = 'Pending Review' | 'Scheduled' | 'In Progress' | 'Completed';
type Ticket = {
  number: string;
  title: string;
  type: string;
  area: string;
  date: string;
  status: Status;
  detail: string;
};

const initialTickets: Ticket[] = [
  { number: 'FSS-1042', title: 'Control points for pipe rack', type: 'Layout', area: 'Unit 1 · CWA-1100', date: 'Sep 29, 2026', status: 'In Progress', detail: 'Establish and verify control points before steel erection begins.' },
  { number: 'FSS-1041', title: 'As-built survey of foundations', type: 'As-built', area: 'Unit 2 · CWA-2200', date: 'Sep 30, 2026', status: 'Scheduled', detail: 'Capture final foundation elevations and anchor bolt locations.' },
  { number: 'FSS-1038', title: 'Topographic survey at access road', type: 'Topo', area: 'OSBL · East access', date: 'Oct 2, 2026', status: 'Pending Review', detail: 'Survey existing grades along the proposed equipment access route.' },
  { number: 'FSS-1026', title: 'Check out total station', type: 'Check-out', area: 'Unit 1 · CWA-1100', date: 'Sep 23, 2026', status: 'Completed', detail: 'Equipment was checked out and returned to the survey team.' },
];

type View = 'overview' | 'requests' | 'new';

export function SampleSite() {
  const [view, setView] = useState<View>('overview');
  const [tickets, setTickets] = useState(initialTickets);
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [created, setCreated] = useState(false);

  function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next: Ticket = {
      number: `FSS-${1043 + tickets.length - initialTickets.length}`,
      title: String(form.get('title')),
      type: String(form.get('type')),
      area: String(form.get('area')),
      date: new Date(`${String(form.get('date'))}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      status: 'Pending Review',
      detail: String(form.get('detail')),
    };
    setTickets(current => [next, ...current]);
    setCreated(true);
    setSelected(next);
    setView('requests');
  }

  const visible = tickets.filter(ticket => filter === 'All' || ticket.status === filter);
  const open = tickets.filter(ticket => ticket.status !== 'Completed').length;

  return <div className="sample-app">
    <aside className="sample-sidebar">
      <div className="sample-brand"><span className="sample-mark">F</span><span>FIELD SURVEY<br /><small>SUPPORT</small></span></div>
      <div className="sample-project-label">PROJECT WORKSPACE</div>
      <div className="sample-project"><span className="sample-project-icon">N</span><span>North River Expansion<small>Active project</small></span></div>
      <nav className="sample-nav" aria-label="Sample navigation">
        <button className={view === 'overview' ? 'active' : ''} onClick={() => { setView('overview'); setSelected(null); }}>Overview</button>
        <button className={view === 'requests' ? 'active' : ''} onClick={() => { setView('requests'); setSelected(null); }}>My requests <span>{tickets.length}</span></button>
        <button className={view === 'new' ? 'active' : ''} onClick={() => { setView('new'); setSelected(null); }}>New request</button>
      </nav>
      <div className="sample-sidebar-footer"><span className="sample-avatar">JM</span><span>Jordan Miller<small>Requester · GC</small></span></div>
    </aside>

    <div className="sample-main">
      <header className="sample-topbar"><div><span className="sample-topbar-project">North River Expansion</span><span className="sample-topbar-separator">/</span><strong>{view === 'overview' ? 'Overview' : view === 'requests' ? 'My requests' : 'New request'}</strong></div><span className="sample-badge">Interactive sample · example data</span></header>
      <main className="sample-content">
        {view === 'overview' && <>
          <div className="sample-heading"><div><p className="sample-eyebrow">Friday, September 25, 2026</p><h1>Good morning, Jordan.</h1><p>Here’s the latest on your survey support requests.</p></div><button className="sample-primary" onClick={() => setView('new')}>+ New request</button></div>
          <div className="sample-stats"><div><span>Open requests</span><strong>{open}</strong><small>Across your project</small></div><div><span>Awaiting review</span><strong>{tickets.filter(ticket => ticket.status === 'Pending Review').length}</strong><small>With survey manager</small></div><div><span>In the field</span><strong>{tickets.filter(ticket => ticket.status === 'In Progress').length}</strong><small>Work underway</small></div></div>
          <div className="sample-section-title"><div><h2>Recent requests</h2><p>Track work from submission through completion.</p></div><button className="sample-text-button" onClick={() => setView('requests')}>View all requests →</button></div>
          <TicketList tickets={tickets.slice(0, 3)} onSelect={setSelected} />
          <div className="sample-tip"><strong>Planning a new request?</strong><p>Have the work location, request type, and needed date ready. Standard requests require at least 48 hours’ notice.</p><button onClick={() => setView('new')}>Start a request →</button></div>
        </>}

        {view === 'requests' && <>
          <div className="sample-heading"><div><p className="sample-eyebrow">PROJECT WORKSPACE</p><h1>My requests</h1><p>See the status and details of work you’ve submitted.</p></div><button className="sample-primary" onClick={() => setView('new')}>+ New request</button></div>
          {created && <div className="sample-confirmation" role="status">Sample request added to this preview. It will reset when the page reloads.</div>}
          <div className="sample-filters" aria-label="Filter requests">{['All', 'Pending Review', 'Scheduled', 'In Progress', 'Completed'].map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
          <TicketList tickets={visible} onSelect={setSelected} />
        </>}

        {view === 'new' && <>
          <div className="sample-heading"><div><p className="sample-eyebrow">SURVEY SUPPORT</p><h1>New request</h1><p>Tell the survey team what you need and where the work will happen.</p></div></div>
          <form className="sample-form" onSubmit={createRequest}>
            <div className="sample-form-section"><span className="sample-step">01</span><div><h2>Work details</h2><p>Describe the work so the team can plan the right crew and equipment.</p><label>Request title<input name="title" required placeholder="e.g. Control points for pipe rack" /></label><label>Description<textarea name="detail" required rows={4} placeholder="What needs to be surveyed or laid out?" /></label><label>Request type<select name="type" required><option value="">Select a type</option><option>Layout</option><option>Check-out</option><option>As-built</option><option>Topo</option><option>Permit</option></select></label></div></div>
            <div className="sample-form-section"><span className="sample-step">02</span><div><h2>Location & timing</h2><p>Choose the work area and when the crew is needed.</p><label>Area of responsibility<select name="area" required><option value="">Select an area</option><option>Unit 1 · CWA-1100</option><option>Unit 2 · CWA-2200</option><option>OSBL · East access</option></select></label><label>Requested date<input name="date" type="date" required min="2026-09-28" defaultValue="2026-09-29" /></label></div></div>
            <div className="sample-form-actions"><span>Example only — no request will be sent.</span><button className="sample-primary" type="submit">Preview request</button></div>
          </form>
        </>}
      </main>
    </div>

    {selected && <div className="sample-overlay" role="presentation" onClick={() => setSelected(null)}><section className="sample-detail" role="dialog" aria-modal="true" aria-label="Request details" onClick={event => event.stopPropagation()}><button className="sample-close" onClick={() => setSelected(null)} aria-label="Close details">×</button><p className="sample-eyebrow">REQUEST DETAILS</p><h2>{selected.title}</h2><p className="sample-detail-number">{selected.number}</p><span className={`sample-status status-${selected.status.toLowerCase().replaceAll(' ', '-')}`}>{selected.status}</span><dl><div><dt>Request type</dt><dd>{selected.type}</dd></div><div><dt>Location</dt><dd>{selected.area}</dd></div><div><dt>Requested date</dt><dd>{selected.date}</dd></div><div><dt>Submitted by</dt><dd>Jordan Miller</dd></div></dl><h3>Work description</h3><p>{selected.detail}</p><div className="sample-detail-note">This is example data for exploring the interface.</div></section></div>}
  </div>;
}

function TicketList({ tickets, onSelect }: { tickets: Ticket[]; onSelect: (ticket: Ticket) => void }) {
  return <div className="sample-ticket-list">{tickets.length ? tickets.map(ticket => <button className="sample-ticket" key={ticket.number} onClick={() => onSelect(ticket)}><span className="sample-ticket-icon">{ticket.type.slice(0, 1)}</span><span className="sample-ticket-body"><strong>{ticket.title}</strong><small>{ticket.number} <span>·</span> {ticket.area}</small></span><span className="sample-ticket-right"><span className={`sample-status status-${ticket.status.toLowerCase().replaceAll(' ', '-')}`}>{ticket.status}</span><small>Needed {ticket.date}</small></span><span className="sample-chevron">›</span></button>) : <p className="sample-empty">No requests match this filter.</p>}</div>;
}
