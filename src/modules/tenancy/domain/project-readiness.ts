export type CrewBuild = 'FULL' | 'MEDIUM' | 'SLIM';

export interface ProjectReadinessFacts {
  crewBuild: CrewBuild;
  aorLevels: number;
  aorNodes: number;
  surveyManagers: number;
  superintendentAorAssignments: number;
  departments: number;
  actingSurveyManagers: number;
  allowedDomains: number;
}

export interface ProjectReadiness {
  hardFailures: string[];
  warnings: string[];
}

/** Fixed, build-aware activation policy from CLAUDE.md §21. */
export function evaluateProjectReadiness(facts: ProjectReadinessFacts): ProjectReadiness {
  const hardFailures: string[] = [];
  const warnings: string[] = [];
  if (facts.aorLevels < 1) hardFailures.push('At least one AOR level is required');
  if (facts.aorNodes < 1) hardFailures.push('At least one AOR node is required');
  if (facts.surveyManagers < 1) hardFailures.push('An active Survey Manager is required');
  if (facts.crewBuild === 'FULL' && facts.superintendentAorAssignments < 1) {
    hardFailures.push('Full Build requires a Survey Superintendent assigned to an AOR node');
  }
  if (facts.departments < 1) warnings.push('No department is configured');
  if (facts.actingSurveyManagers < 1) warnings.push('No acting Survey Manager is designated');
  if (facts.allowedDomains < 1) warnings.push('No self-registration domain is configured');
  return { hardFailures, warnings };
}
