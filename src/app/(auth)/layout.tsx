import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main>
      <div className="page-shell">{children}</div>
    </main>
  );
}
