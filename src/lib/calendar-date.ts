/** Display the calendar portion without converting midnight through the viewer's timezone. */
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(date);
}
