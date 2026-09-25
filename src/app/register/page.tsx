import { RegisterForm } from './register-form';
import { Shell } from '@/app/ui/shell';

export default async function RegisterPage({ searchParams }: {
  searchParams: Promise<{ tenantId?: string; projectId?: string }>;
}) {
  const query = await searchParams;
  if (typeof query.projectId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(query.projectId)) {
    return <Shell><h1>Create an account</h1><p className="notice">Open your project’s request link to register, or use the invitation link from your administrator.</p></Shell>;
  }
  return <RegisterForm projectId={query.projectId} tenantId={typeof query.tenantId === 'string' ? query.tenantId : ''} />;
}
