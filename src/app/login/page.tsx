import { LoginForm } from './login-form';
import { safeReturnPath } from '../ui/api';

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ tenantId?: string; next?: string }>;
}) {
  const query = await searchParams;
  return <LoginForm tenantId={typeof query.tenantId === 'string' ? query.tenantId : ''}
    next={safeReturnPath(typeof query.next === 'string' ? query.next : undefined)} />;
}
