import type { ProjectRole } from '@/modules/identity/domain/types';
export function accountNavigation(projectId?:string,role?:ProjectRole){
 const context=projectId?`?projectId=${encodeURIComponent(projectId)}`:'';
 return [
 {label:'Home',href:projectId?`/projects/${encodeURIComponent(projectId)}`:'/projects'},
 {label:'Profile',href:`/profile${context}`},
 {label:'Assignment Details',href:`/assignment-details${context}`},
 ...(projectId&&role&&['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'].includes(role)?[{label:'Team Management',href:`/projects/${encodeURIComponent(projectId)}/survey/teams`}]:[]),
 {label:'Projects',href:'/projects'}
 ];
}
