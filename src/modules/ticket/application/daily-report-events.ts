export const dailyReportEvents=[
  'ticket.created','ticket.submitted','ticket.approved','ticket.rejected','ticket.rejection_overridden',
  'ticket.assigned','ticket.in_progress','ticket.pending_pc_approval','ticket.completed',
  'ticket.delayed','ticket.delay_restarted','ticket.requester_canceled','ticket.field_canceled','ticket.survey_canceled',
] as const;
export type DailyReportEvent=typeof dailyReportEvents[number];
