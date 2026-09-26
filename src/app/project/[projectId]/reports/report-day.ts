/** Convert a browser-local calendar date to an inclusive/exclusive UTC window. */
export function reportDayWindow(value:string):{from:string;until:string}|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const start=new Date(value+'T00:00:00');
  if(!Number.isFinite(start.getTime())||localReportDate(start)!==value)return null;
  const end=new Date(start);end.setDate(end.getDate()+1);
  return {from:start.toISOString(),until:end.toISOString()};
}
export function localReportDate(date=new Date()):string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
