'use client';
import { useEffect, useRef, useState } from 'react';

export function ErrorBanner({ message }: { message: string }) {
  return <p className="error-banner" role="alert">{message}</p>;
}

/** How long a completion message stays before it fades away on its own. */
export const SUCCESS_DISMISS_MS = 8000;
/** Messages that ask the reader to do something (sign in again) stay until dismissed. */
export const isActionableNotice = (message: string) => /sign[ -]?in|sign out|signs? in again/i.test(message);

/**
 * Shared lifecycle for completion messages: dismissible, auto-dismissing unless
 * actionable, paused while hovered or focused, and shown again only when the
 * message itself changes (so repeats do not stack and stale ones do not return).
 */
export function useDismissibleNotice(message: string, persist = false) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const visible = !!message && dismissed !== message;
  const sticky = persist || isActionableNotice(message);
  const latest = useRef(message); latest.current = message;
  useEffect(() => {
    if (!visible || sticky || paused) return;
    const timer = window.setTimeout(() => setDismissed(latest.current), SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [visible, sticky, paused, message]);
  return {
    visible,
    dismiss: () => setDismissed(message),
    pauseProps: {
      onPointerEnter: () => setPaused(true), onPointerLeave: () => setPaused(false),
      onFocus: () => setPaused(true), onBlur: () => setPaused(false),
    },
  };
}

export function DismissButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="notice-dismiss" aria-label="Dismiss message" onClick={onClick}>×</button>;
}

export function SuccessBanner({ message, persist = false }: { message: string; persist?: boolean }) {
  const notice = useDismissibleNotice(message, persist);
  if (!notice.visible) return null;
  return <p className="success-banner notice-dismissible" role="status" {...notice.pauseProps}>
    <span>{message}</span><DismissButton onClick={notice.dismiss} />
  </p>;
}
