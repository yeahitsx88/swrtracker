import type { TicketRecord } from './contracts';

export function filterOperationsTickets(tickets: TicketRecord[], query: string, area: string, status: string, priority: string) {
  const term = query.trim().toLocaleLowerCase();
  return tickets.filter(ticket => (!area || ticket.aorNodeId === area) && (!status || ticket.status === status) &&
    (!priority || ticket.priority === priority) && (!term ||
      [ticket.ticketNumber, ticket.description, ticket.fieldContact, ticket.requesterName].some(value => value?.toLocaleLowerCase().includes(term))));
}

export function operationsPage<T>(items: T[], requestedPage: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.max(1, Math.min(requestedPage, pages));
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), page, pages, total: items.length, first: items.length ? start + 1 : 0, last: Math.min(start + size, items.length) };
}

export const operationsStatusLabel = (status: string) => status.toLowerCase().replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());

export function operationsServerPage<T>(items: T[], total: number, page: number, size: number) {
  return { items, total, page, pages: Math.max(1, Math.ceil(total / size)), first: items.length ? (page - 1) * size + 1 : 0, last: items.length ? (page - 1) * size + items.length : 0 };
}
