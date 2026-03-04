'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from './cn';

interface ProjectNavProps {
  projectId: string;
}

const tabs: Array<{ label: string; href: (projectId: string) => string }> = [
  { label: 'New Request', href: (projectId) => `/projects/${projectId}/request/new` },
  { label: 'My Requests', href: (projectId) => `/projects/${projectId}/my-requests` },
  { label: 'Drafts', href: (projectId) => `/projects/${projectId}/drafts` },
  { label: 'Crew Work', href: (projectId) => `/projects/${projectId}/crew/work` },
  { label: 'PC Approvals', href: (projectId) => `/projects/${projectId}/crew/approvals` },
  { label: 'Admin', href: (projectId) => `/projects/${projectId}/admin` },
];

export function ProjectNav({ projectId }: ProjectNavProps) {
  const pathname = usePathname();

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
