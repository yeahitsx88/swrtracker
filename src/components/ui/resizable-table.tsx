'use client';
import { createContext, useContext, useEffect, useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type ThHTMLAttributes } from 'react';

/**
 * Spreadsheet-style column resizing for tables that do not use AdministrationRecords:
 * drag the edge between headings, arrow keys on the focused edge, double-click to
 * restore the natural layout. Widths are saved per table in this browser.
 */
const MIN = 80, MAX = 600;
type Widths = Record<string, number>;
const Context = createContext<{ widths: Widths; sized: boolean; resize: (column: string, width: number, header: HTMLElement) => void; reset: () => void } | null>(null);

export function ResizableTable({ storageKey, className, children }: { storageKey: string; className?: string; children: ReactNode }) {
  const key = `swr:columns:table:${storageKey}`;
  const [widths, setWidths] = useState<Widths>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
      if (saved && typeof saved === 'object') setWidths(Object.fromEntries(Object.entries(saved as Widths).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k, Math.min(MAX, Math.max(MIN, v))])));
    } catch { /* Defaults apply without storage. */ }
  }, [key]);
  const save = (next: Widths) => { try { if (Object.keys(next).length) localStorage.setItem(key, JSON.stringify(next)); else localStorage.removeItem(key); } catch { /* Still applies for this visit. */ } };
  const sized = Object.keys(widths).length > 0;
  const resize = (column: string, width: number, header: HTMLElement) => setWidths(current => {
    // First resize fixes every column at its current width so nothing else jumps.
    const seeded = Object.keys(current).length ? current : Object.fromEntries([...header.closest('tr')?.querySelectorAll<HTMLElement>('th[data-column]') ?? []].map(cell => [cell.dataset.column ?? '', Math.round(cell.getBoundingClientRect().width)]));
    const next = { ...seeded, [column]: Math.min(MAX, Math.max(MIN, Math.round(width))) };
    save(next); return next;
  });
  const reset = () => { setWidths({}); save({}); };
  return <Context.Provider value={{ widths, sized, resize, reset }}>
    <table className={`${className ?? ''}${sized ? ' record-sized-columns' : ''}`}>{children}</table>
  </Context.Provider>;
}

export function ResizableTh({ column, children, ...rest }: { column: string; children: ReactNode } & ThHTMLAttributes<HTMLTableCellElement>) {
  const table = useContext(Context);
  const headingId = useId();
  if (!table) return <th {...rest}>{children}</th>;
  const width = table.widths[column];
  const start = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    const handle = event.currentTarget, header = handle.parentElement;
    if (!header) return;
    const origin = event.clientX, initial = header.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
    handle.onpointermove = move => table.resize(column, initial + move.clientX - origin, header);
    handle.onpointerup = () => { handle.onpointermove = null; handle.onpointerup = null; };
    handle.onlostpointercapture = () => { handle.onpointermove = null; };
  };
  const key = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const header = event.currentTarget.parentElement;
    if (!header) return;
    table.resize(column, header.getBoundingClientRect().width + (event.key === 'ArrowRight' ? 10 : -10), header);
  };
  return <th {...rest} data-column={column} style={{ ...rest.style, ...(width ? { width } : {}) }}>
    <span id={headingId}>{children}</span>
    <span className="record-column-resize" role="separator" aria-orientation="vertical" aria-label="Resize column" aria-describedby={headingId}
      aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={width} tabIndex={0} title="Drag to resize; double-click to restore"
      onPointerDown={start} onKeyDown={key} onDoubleClick={table.reset} />
  </th>;
}
