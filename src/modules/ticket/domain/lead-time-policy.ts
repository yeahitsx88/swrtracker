export interface ProjectLeadTimeConfig {
  enforcementEnabled: boolean;
  leadTimeDays: number;
}

export const DEFAULT_LEAD_TIME_DAYS = 2;
export const MIN_LEAD_TIME_DAYS = 1;
export const MAX_LEAD_TIME_DAYS = 30;

export function isLeadTimeDaysValid(days: number): boolean {
  return Number.isInteger(days) && days >= MIN_LEAD_TIME_DAYS && days <= MAX_LEAD_TIME_DAYS;
}

export function normalizeProjectLeadTimeConfig(
  config: Partial<ProjectLeadTimeConfig> | null | undefined,
): ProjectLeadTimeConfig {
  const enforcementEnabled =
    config?.enforcementEnabled === undefined ? true : config.enforcementEnabled;
  const leadTimeDays = isLeadTimeDaysValid(config?.leadTimeDays ?? NaN)
    ? (config?.leadTimeDays as number)
    : DEFAULT_LEAD_TIME_DAYS;

  return {
    enforcementEnabled,
    leadTimeDays,
  };
}

export function doesRequestedDateMeetLeadTime(
  requestedDate: Date,
  now: Date,
  config: ProjectLeadTimeConfig,
): boolean {
  if (!config.enforcementEnabled) return true;
  const requiredMs = config.leadTimeDays * 24 * 60 * 60 * 1000;
  return requestedDate.getTime() >= now.getTime() + requiredMs;
}

