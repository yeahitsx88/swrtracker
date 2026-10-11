/**
 * Decision 57 / D6: access removal reasons are chosen from a fixed list and stored as a
 * bracketed prefix in the existing reason field, e.g. "[Resigned] Last day 4 October".
 * The server's existing 10–1000 character rule still applies to the stored text.
 */
export const OFFBOARDING_REASONS = ['Terminated', 'Resigned', 'Transferred', 'Other'] as const;
export type OffboardingReasonCategory = typeof OFFBOARDING_REASONS[number];

export const OTHER_COMMENT_MIN = 10;
const MAX = 1000;
const prefix = (category: OffboardingReasonCategory) => `[${category}]`;

/** Longest comment that still fits the stored reason. */
export const offboardingCommentLimit = (category: OffboardingReasonCategory) => MAX - prefix(category).length - 1;

/** The stored reason, or null while incomplete ("Other" needs its own explanation). */
export function composeOffboardingReason(category: OffboardingReasonCategory | '', comment: string): string | null {
  if (!category) return null;
  const text = comment.trim();
  if (category === 'Other' && text.length < OTHER_COMMENT_MIN) return null;
  if (text.length > offboardingCommentLimit(category)) return null;
  return text ? `${prefix(category)} ${text}` : prefix(category);
}
