import type { ProjectRole } from '@/modules/identity/domain/types';

export interface ProjectNavigationItem {
  label: string;
  href: (projectId: string) => string;
}

const newRequest: ProjectNavigationItem = {
  label: 'New Request',
  href: (projectId) => `/projects/${projectId}/request/new`,
};
const myRequests: ProjectNavigationItem = {
  label: 'My Requests',
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
const admin: ProjectNavigationItem = {
  label: 'Admin',
  href: (projectId) => `/projects/${projectId}/admin`,
};

const navigationByRole: Record<ProjectRole, readonly ProjectNavigationItem[]> = {
  REQUESTER: [newRequest, myRequests, drafts],
  SURVEY_MANAGER: [surveyOperations, allRequests],
  PARTY_CHIEF: [crewWork, pcApprovals],
  INSTRUMENT_MAN: [crewWork],
  PROJECT_ADMIN: [admin],
  SURVEY_SUPERINTENDENT: [allRequests, crewWork],
  CAD_TECHNICIAN: [allRequests],
  CAD_LEAD: [allRequests],
  DEPARTMENT_MANAGER: [allRequests],
  DEPARTMENT_LEAD: [allRequests],
  VIEWER: [allRequests],
  AREA_VIEWER: [allRequests],
  SUBCONTRACTS_COORDINATOR: [allRequests],
};

export function getProjectNavigation(role: ProjectRole): readonly ProjectNavigationItem[] {
  return navigationByRole[role];
}

export function getProjectLandingHref(projectId: string, role: ProjectRole): string {
  return getProjectNavigation(role)[0]?.href(projectId) ?? `/projects/${projectId}/requests`;
}
