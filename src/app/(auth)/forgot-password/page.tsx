import Link from 'next/link';
import { Card } from '@/components/ui';

export default function ForgotPasswordPage() {
  return (
    <Card
      title="Forgot Password"
      description="Password reset API is not yet exposed in this phase. Contact your tenant administrator for reset support."
    >
      <div className="row">
        <Link href="/login" className="app-link">Back to Login</Link>
      </div>
    </Card>
  );
}
