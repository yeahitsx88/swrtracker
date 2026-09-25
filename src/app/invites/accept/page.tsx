import { InviteForm } from './invite-form';

export const metadata = { title: 'Accept invitation | Field Survey Support',
  robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default async function InvitePage({ searchParams }: {
  searchParams: Promise<{ token?: string }>;
}) {
  const query = await searchParams;
  return <InviteForm token={typeof query.token === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(query.token) ? query.token : null} />;
}
