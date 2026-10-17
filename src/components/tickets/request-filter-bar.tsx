'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { TicketStatus } from '@/lib/contracts';
import { operationsStatusLabel } from '@/lib/operations-view';
import { Icon } from '@/components/ui/icon';

export interface QueueChoice { value: string; label: string }

/**
 * Writes list filters into the URL only. The list page re-reads the URL and the
 * server applies its own visibility scope; these controls never widen access.
 */
export function RequestFilterBar({ statuses, queues, label = 'Filter requests' }: {
  statuses: readonly TicketStatus[];
  queues?: readonly QueueChoice[];
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [text, setText] = useState(search.get('query') ?? '');
  useEffect(() => { setText(search.get('query') ?? ''); }, [search]);

  function apply(changes: Record<string, string>) {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    apply({ query: text.trim().slice(0, 200) });
  }

  const active = ['query', 'status', 'queue'].some(key => search.has(key));
  return (
    <form className="request-filter-bar" role="search" aria-label={label} onSubmit={submit}>
      <label className="field request-filter-search">
        <span className="field-label">Search</span>
        <span className="input-with-icon">
          <Icon name="search" size={16} />
          <input className="input" type="search" maxLength={200} value={text} placeholder="Number, details or contact"
            onChange={event => setText(event.target.value)} />
        </span>
      </label>
      {queues?.length ? (
        <label className="field">
          <span className="field-label">Show</span>
          <select className="select" value={search.get('queue') ?? ''} onChange={event => apply({ queue: event.target.value })}>
            {queues.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select>
        </label>
      ) : null}
      <label className="field">
        <span className="field-label">Status</span>
        <select className="select" value={search.get('status') ?? ''} onChange={event => apply({ status: event.target.value })}>
          <option value="">Any status</option>
          {statuses.map(status => <option key={status} value={status}>{operationsStatusLabel(status)}</option>)}
        </select>
      </label>
      <div className="request-filter-actions">
        <button type="submit" className="button button-secondary">Search</button>
        {active ? <button type="button" className="button button-ghost" onClick={() => { setText(''); router.replace(pathname, { scroll: false }); }}>Clear</button> : null}
      </div>
    </form>
  );
}
