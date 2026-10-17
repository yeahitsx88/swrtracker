/**
 * One reason an action cannot run yet. `target` is the id of the field or area that needs
 * attention; `reveal` first brings it on screen when it lives on another step or tab.
 */
export interface ActionBlocker { reason: string; target?: string; reveal?: () => void }

/** Keeps only the reasons whose condition holds, in order, so call sites read as a checklist. */
export function blockersFrom(checks: ReadonlyArray<readonly [boolean, string, string?]>): ActionBlocker[] {
  return checks.filter(([blocked]) => blocked).map(([, reason, target]) => (target ? { reason, target } : { reason }));
}
