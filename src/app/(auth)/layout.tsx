import type { ReactNode } from 'react';
import { ProductBrand } from '@/components/ui/product-brand';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <ProductBrand />
      <div className="page-shell">{children}</div>
    </main>
  );
}
