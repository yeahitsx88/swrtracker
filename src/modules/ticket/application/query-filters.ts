import type { TicketPriority, TicketStatus, TicketType } from '../domain/types';

export interface TicketQueryFilters {
  queue?: 'all' | 'open' | 'assignment' | 'completed' | 'overdue';
  crewId?: string;
  instrumentManId?: string;
  dateBasis?: 'needBy' | 'submitted' | 'completed';
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  areaId?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  ticketType?: TicketType;
}
