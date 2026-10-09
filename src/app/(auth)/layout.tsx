import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { requireActiveAuth } from '@/lib/auth';
import { UnauthorizedError } from '@/shared/errors';
import { ProductBrand } from '@/components/ui/product-brand';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const form = (
    <main className="auth-shell">
      <ProductBrand />
      <div className="page-shell">{children}</div>
    </main>
  );
  if ((await headers()).get('x-swr-auth-entry') !== '1') return form;
  try {
    await requireActiveAuth(new NextRequest('http://swr.internal/', {
      headers: { cookie: (await cookies()).toString() },
    }));
  } catch (error) {
    if (error instanceof UnauthorizedError) return form;
    throw error;
  }
  redirect('/projects');
}
