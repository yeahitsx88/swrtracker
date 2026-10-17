import type { ProjectRole } from '@/modules/identity/domain/types';
import type { TicketStatus, TicketType } from '@/modules/ticket/domain/types';

export interface MetricsFilters {
  cohort?: 'areaWorkload' | 'linkedCrews';
  areaId?: string;
  ticketType?: TicketType;
  status?: TicketStatus;
  crewId?: string;
  instrumentManId?: string;
  population?: 'all' | 'open' | 'completed' | 'assignment' | 'overdue';
  dateBasis?: 'needBy' | 'submitted' | 'completed';
  dateFrom?: string;
  dateTo?: string;
}

/** Personnel comparison requires a crew scope backed by an explicit reporting link.
 * Superintendent Area scope alone cannot establish that link. */
export function canAnalyzeSurveyPersonnel(role: ProjectRole, hasLinkedCrewScope = false): boolean {
  return role === 'SURVEY_MANAGER' || role === 'PARTY_CHIEF' || (role === 'SURVEY_SUPERINTENDENT' && hasLinkedCrewScope);
}
