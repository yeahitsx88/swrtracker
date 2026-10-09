'use client';

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type Ref } from 'react';
import type { ActionBlocker } from './action-blockers';
import { cn } from './cn';
import './blocked-action.css';


const FOCUSABLE = 'input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href],summary,[tabindex]:not([tabindex="-1"])';

function attentionTarget(id: string): HTMLElement | null {
  const element = document.getElementById(id);
  if (!element) return null;
  for (let details = element.closest('details'); details; details = details.parentElement?.closest('details') ?? null) details.open = true;
  if (element instanceof HTMLDetailsElement) element.open = true;
  return element;
}

/** 'listed' outlines every field while the explanation is open; 'focus' flashes the one being shown. */
function mark(element: HTMLElement, state: 'listed' | 'focus', on: boolean) {
  if (on) element.dataset.attention = state;
  else if (element.dataset.attention === state) delete element.dataset.attention;
}

/** Scrolls to, focuses and briefly highlights the field or area behind a blocked action. */
export function highlightTarget(id: string) {
  const element = attentionTarget(id);
  if (!element) return;
  const focusable = element.matches(FOCUSABLE) ? element : element.querySelector<HTMLElement>(FOCUSABLE);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  if (focusable) focusable.focus({ preventScroll: true });
  else { if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1'); element.focus({ preventScroll: true }); }
  mark(element, 'focus', true);
  window.setTimeout(() => mark(element, 'focus', false), 2600);
}

interface BlockedButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  blockers: ActionBlocker[];
  blockedTitle?: string;
  baseClassName: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A button whose action is unavailable for explainable reasons. It stays focusable
 * (aria-disabled, not disabled), and activating it lists why and highlights the fields involved.
 */
export function BlockedButton({ blockers, blockedTitle, baseClassName, className, children, onClick: _onClick, type, ref, ...rest }: BlockedButtonProps) {
  const popupId = useId(), summaryId = useId(), titleId = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  const title = blockedTitle ?? 'This can’t be done yet';
  const targets = blockers.flatMap(blocker => (blocker.target ? [blocker.target] : []));
  const targetKey = targets.join(' ');

  function place() {
    const button = trigger.current?.getBoundingClientRect(), box = popup.current?.getBoundingClientRect();
    if (!button || !box) return;
    const below = button.bottom + 8, maxTop = Math.max(16, window.innerHeight - box.height - 16);
    const top = Math.min(maxTop, Math.max(16, below + box.height <= window.innerHeight - 16 ? below : button.top - box.height - 8));
    const left = Math.max(16, Math.min(button.left, window.innerWidth - box.width - 16));
    setPosition(current => (current.left === left && current.top === top ? current : { left, top }));
  }
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const element = popup.current;
    if (!element) return;
    if (element.matches(':popover-open')) element.hidePopover();
    else { element.showPopover(); place(); }
  }

  useEffect(() => {
    if (!open) return;
    const elements = targetKey.split(' ').flatMap(id => { const element = id ? document.getElementById(id) : null; return element ? [element] : []; });
    elements.forEach(element => mark(element, 'listed', true));
    // Follow the trigger while open: content loading above it can move it without a scroll or resize event.
    let frame = 0;
    const follow = () => { place(); frame = requestAnimationFrame(follow); };
    frame = requestAnimationFrame(follow);
    return () => {
      cancelAnimationFrame(frame);
      elements.forEach(element => mark(element, 'listed', false));
    };
  }, [open, targetKey]);

  const setRef = (element: HTMLButtonElement | null) => {
    trigger.current = element;
    if (typeof ref === 'function') ref(element); else if (ref) ref.current = element;
  };

  return <>
    <button {...rest} ref={setRef} type={type ?? 'button'} className={cn(baseClassName, 'button-blocked', className)}
      aria-disabled="true" aria-haspopup="dialog" aria-expanded={open} aria-controls={popupId} aria-describedby={summaryId} onClick={toggle}>
      {children}
    </button>
    <span id={summaryId} hidden>{`${title}: ${blockers.map(blocker => blocker.reason).join(' ')}`}</span>
    <div ref={popup} id={popupId} popover="auto" role="dialog" aria-labelledby={titleId} className="blocked-popover" style={position}
      onToggle={event => setOpen((event.nativeEvent as ToggleEvent).newState === 'open')}>
      <p className="blocked-popover-title" id={titleId}>{title}</p>
      <ul className="blocked-popover-list">
        {blockers.map(blocker => <li key={blocker.reason}>
          <span>{blocker.reason}</span>
          {blocker.target ? <button type="button" className="blocked-popover-jump" onClick={() => {
            const target = blocker.target;
            popup.current?.hidePopover();
            if (target) highlightTarget(target);
          }}>Show me</button> : null}
        </li>)}
      </ul>
    </div>
  </>;
}
