import type { ReactNode } from 'react';
import { AccountShell } from '@/components/ui/account-menu';

export default function ProjectsRootLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
