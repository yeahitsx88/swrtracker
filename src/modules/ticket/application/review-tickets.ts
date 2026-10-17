import type { TicketQueryFilters } from './query-filters';
import type { VisibilityScope } from './ports';
import type { DbClient, UUID } from '@/shared/types';
import { ForbiddenError } from '@/shared/errors';

export interface ReviewFilters extends TicketQueryFilters {
  crewId?: string;
  dateFrom?: string;
  dateTo?: string;
  dateBasis?: 'needBy' | 'submitted' | 'completed';
}
export interface ReviewOptions {
  projectId: UUID; visibility: VisibilityScope; filters: ReviewFilters;
  limit: number; offset: number; sort: 'newest' | 'oldest' | 'needBy';
}
export interface ReviewBucket { key: string; label: string; count: number }
export interface ReviewResult {
  total: number; completed: number; canceled: number; open: number;
  firstDate: string | null; lastDate: string | null;
  imported: number; simulatedCompletions: number;
  statuses: ReviewBucket[]; areas: ReviewBucket[]; types: ReviewBucket[]; months: ReviewBucket[];
  facets: { areas: ReviewBucket[]; crews: ReviewBucket[]; statuses: ReviewBucket[]; types: ReviewBucket[] };
  items: Array<{ id: string; number: string | null; description: string; status: string; type: string; area: string; requester: string; crew: string | null; needBy: string; completedAt: string | null }>;
}
export interface TicketReviewReader { review(db: DbClient, tenantId: UUID, options: ReviewOptions): Promise<ReviewResult> }
export async function reviewTickets(reader: TicketReviewReader, db: DbClient, tenantId: UUID, options: ReviewOptions) {
  if (['REQUESTER', 'INSTRUMENT_MAN', 'PROJECT_ADMIN'].includes(options.visibility.actorRole)) {
    throw new ForbiddenError('Project review is not available for this role. Use your existing request or crew workspace.');
  }
  return reader.review(db, tenantId, options);
}
