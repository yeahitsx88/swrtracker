import type { ProjectRole } from '@/modules/identity/domain/types';
import type { ProjectMembershipRecord } from '@/lib/contracts/projects';

export interface ProjectNavigationItem {
  label: string;
  href: (projectId: string) => string;
  group?: 'Home' | 'Work' | 'People' | 'Administration';
}

const home: ProjectNavigationItem = { label: 'Home', href: id => `/projects/${id}/home`, group: 'Home' };

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
  label: 'Field Report Review',
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

export function getProjectNavigation(role: ProjectRole | null, canAdminister=false, status: ProjectMembershipRecord['status']='ACTIVE'): readonly ProjectNavigationItem[] {
  const operational = role ? navigationByRole[role] : [];
  const items = operational.filter(item => !(item === newRequest && status !== 'ACTIVE') && !(item === admin && !canAdminister));
  if (canAdminister && !items.includes(admin)) items.push(admin);
  // The existing team page permits scoped read access for Superintendent and Chief.
  if (role === 'SURVEY_SUPERINTENDENT' || role === 'PARTY_CHIEF') items.push(teamManagement);
  if(role&&['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'].includes(role))items.push({label:'Review Requests',href:id=>`/projects/${id}/survey/review`});
  if(role && ['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'].includes(role))items.push({label:'Notifications',href:id=>`/projects/${id}/survey/notifications`});
  if(role||canAdminister)items.push({label:'Help Desk',href:id=>`/projects/${id}/help-desk`});
  return role || canAdminister ? [home, ...items.map(item => ({...item, group: item === admin ? 'Administration' as const : item === teamManagement ? 'People' as const : 'Work' as const}))] : [];
}

export function getProjectLandingHref(projectId: string, role: ProjectRole): string {
  return role === 'PROJECT_ADMIN' ? `/projects/${projectId}/admin` : `/projects/${projectId}/home`;
}

export function getMembershipLandingHref(project:ProjectMembershipRecord):string {
  if((project.status==='SETUP' && project.canAdminister) || project.role==='PROJECT_ADMIN')return `/projects/${project.id}/admin`;
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
