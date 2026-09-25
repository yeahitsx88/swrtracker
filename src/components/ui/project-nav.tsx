'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { cn } from './cn';
import { getProjectNavigation } from './project-navigation';

interface ProjectNavProps {
  projectId: string;
  role: ProjectRole;
}

export function ProjectNav({ projectId, role }: ProjectNavProps) {
  const pathname = usePathname();
  const tabs = getProjectNavigation(role);

  return (
    <nav className="app-links" style={{ marginTop: '0.45rem' }}>
      {tabs.map((tab) => {
        const href = tab.href(projectId);
        const isActive = pathname === href;

        return (
          <Link
            key={tab.label}
            className={cn('app-link', isActive && 'app-link-active')}
            href={href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
