import type { ReactNode } from 'react';
import { AccountMenu } from '@/components/ui/account-menu';
import { ProductBrand } from '@/components/ui/product-brand';

export default function ProjectsRootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-nav">
        <div className="app-nav-inner">
          <ProductBrand />
          <AccountMenu />
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="page-shell">{children}</div>
      </main>
    </>
  );
}
