export interface ProjectRequestConfig {
  leadTimeEnforcementEnabled: boolean;
  leadTimeDays: number;
}

export interface ProjectRequestConfigResponse {
  config: ProjectRequestConfig;
}
