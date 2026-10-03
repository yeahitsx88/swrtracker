import type { ProjectRole } from '@/modules/identity/domain/types';
import type { ProjectMembershipRecord } from '@/lib/contracts/projects';

export interface ProjectNavigationItem {
  label: string;
  href: (projectId: string) => string;
}

const newRequest: ProjectNavigationItem = {
  label: 'New Request',
  href: (projectId) => `/projects/${projectId}/request/new`,
};
const myRequests: ProjectNavigationItem = {
  label: 'Requests',
  href: (projectId) => `/projects/${projectId}/my-requests`,
};
const drafts: ProjectNavigationItem = {
  label: 'Drafts',
  href: (projectId) => `/projects/${projectId}/drafts`,
};
const allRequests: ProjectNavigationItem = {
  label: 'All Requests',
  href: (projectId) => `/projects/${projectId}/requests`,
};
const crewWork: ProjectNavigationItem = {
  label: 'Crew Work',
  href: (projectId) => `/projects/${projectId}/crew/work`,
};
const surveyOperations: ProjectNavigationItem = {
  label: 'Survey Operations',
  href: (projectId) => `/projects/${projectId}/survey/operations`,
};
const pcApprovals: ProjectNavigationItem = {
  label: 'PC Approvals',
  href: (projectId) => `/projects/${projectId}/crew/approvals`,
};
const teamManagement: ProjectNavigationItem = {
  label: 'Team Management',
  href: (projectId) => `/projects/${projectId}/survey/teams`,
};
const admin: ProjectNavigationItem = {
  label: 'Admin',
  href: (projectId) => `/projects/${projectId}/admin`,
};

const navigationByRole: Record<ProjectRole, readonly ProjectNavigationItem[]> = {
  REQUESTER: [newRequest, myRequests, drafts],
  SURVEY_MANAGER: [surveyOperations, teamManagement, allRequests],
  PARTY_CHIEF: [crewWork, pcApprovals],
  INSTRUMENT_MAN: [crewWork],
  PROJECT_ADMIN: [admin],
  SURVEY_SUPERINTENDENT: [allRequests, surveyOperations, crewWork],
  CAD_TECHNICIAN: [allRequests],
  CAD_LEAD: [allRequests],
  DEPARTMENT_MANAGER: [allRequests],
  DEPARTMENT_LEAD: [allRequests],
  VIEWER: [allRequests],
  AREA_VIEWER: [allRequests],
  SUBCONTRACTS_COORDINATOR: [allRequests],
};

export function getProjectNavigation(role: ProjectRole,canAdminister=false): readonly ProjectNavigationItem[] {
  const operational=navigationByRole[role];
  return canAdminister&&!operational.includes(admin)?[...operational,admin]:operational;
}

export function getProjectLandingHref(projectId: string, role: ProjectRole): string {
  return getProjectNavigation(role)[0]?.href(projectId) ?? `/projects/${projectId}/requests`;
}

export function getMembershipLandingHref(project:ProjectMembershipRecord):string {
  if(project.role==='PROJECT_ADMIN'||project.canAdminister&&project.role==='REQUESTER')return `/projects/${project.id}/admin`;
  if(project.status==='ARCHIVED')return `/projects/${project.id}/${project.role==='REQUESTER'?'my-requests':'requests'}`;
  return getProjectLandingHref(project.id,project.role);
}

export function findProjectLandingHref(
  projects: readonly ProjectMembershipRecord[],
  projectId: string,
): string | null {
  const normalizedProjectId = projectId.trim();
  const membership = projects.find((project) => project.id === normalizedProjectId);
  return membership ? getMembershipLandingHref(membership) : null;
}
