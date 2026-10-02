'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { Icon, type IconName } from './icon';
import { getProjectNavigation } from './project-navigation';

interface ProjectNavProps {
  projectId: string;
  role: ProjectRole;
}

/** Presentation only: icons for the existing role navigation labels. */
const ICONS: Record<string, IconName> = {
  'New Request': 'plus',
  Requests: 'list',
  Drafts: 'draft',
  'All Requests': 'search',
  'Crew Work': 'crew',
  'Survey Operations': 'gauge',
  'PC Approvals': 'check',
  'Team Management': 'team',
  Admin: 'settings',
};

export function ProjectNav({ projectId, role }: ProjectNavProps) {
  const pathname = usePathname();
  const tabs = getProjectNavigation(role);

  return (
    <nav className="project-tabs" aria-label="Project">
      {tabs.map((tab) => {
        const href = tab.href(projectId);
        const isActive = pathname === href;

        return (
          <Link
            key={tab.label}
            className="project-tab"
            href={href}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon name={ICONS[tab.label] ?? 'list'} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
