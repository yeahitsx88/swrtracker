import { notFound } from 'next/navigation';
import { TicketDetail } from './ticket-detail';

export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(ticketId)) notFound();
  return <TicketDetail ticketId={ticketId} />;
}
