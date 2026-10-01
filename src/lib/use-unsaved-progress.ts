'use client';

import { useEffect } from 'react';

/** Explicit saves only: warn before abandoning local progress, never autosave it. */
export function useUnsavedProgress(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const leavingLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm('Leave without saving your latest progress? Unsaved fields and selected files will be lost.')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', leavingLink, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', leavingLink, true); };
  }, [unsaved]);
}
