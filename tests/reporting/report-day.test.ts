import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { localReportDate, reportDayWindow } from '@/app/project/[projectId]/reports/report-day';

test('report day conversion preserves the local calendar and rejects invalid dates',()=>{
  assert.equal(localReportDate(new Date(2026,8,25,23,59)),'2026-09-25');
  for(const invalid of ['','2026-02-30','2026-13-01','2026-9-25','not-a-date'])assert.equal(reportDayWindow(invalid),null);
  const window=reportDayWindow('2026-09-25')!;
  assert.equal(new Date(window.from).getHours(),0);assert.equal(new Date(window.until).getHours(),0);
  assert.equal(localReportDate(new Date(window.until)),'2026-09-26');
  assert.equal(localReportDate(new Date(reportDayWindow('2026-12-31')!.until)),'2027-01-01');
  assert.equal(localReportDate(new Date(reportDayWindow('2024-02-29')!.until)),'2024-03-01');
});

test('report day follows America/Chicago daylight-saving calendar boundaries',()=>{
  const output=execFileSync(process.execPath,['--import','tsx','--eval',
    "const {reportDayWindow}=require('./src/app/project/[projectId]/reports/report-day.ts');console.log(JSON.stringify(['2026-03-08','2026-11-01'].map(day=>reportDayWindow(day))));"],
    {encoding:'utf8',env:{...process.env,TZ:'America/Chicago'}});
  const [spring,fall]=JSON.parse(output) as Array<{from:string;until:string}>;
  assert.equal(Date.parse(spring!.until)-Date.parse(spring!.from),23*3600000);
  assert.equal(Date.parse(fall!.until)-Date.parse(fall!.from),25*3600000);
  assert.equal(spring!.from,'2026-03-08T06:00:00.000Z');
  assert.equal(fall!.until,'2026-11-02T06:00:00.000Z');
});
