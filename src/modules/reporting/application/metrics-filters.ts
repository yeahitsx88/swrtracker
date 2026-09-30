import type { ProjectRole } from '@/modules/identity/domain/types';
import type { TicketStatus, TicketType } from '@/modules/ticket/domain/types';

export interface MetricsFilters {
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

/** A read-only or administrative role alone does not grant personnel analysis. */
export function canAnalyzeSurveyPersonnel(role: ProjectRole): boolean {
  return role === 'SURVEY_MANAGER' || role === 'SURVEY_SUPERINTENDENT' || role === 'PARTY_CHIEF';
}
