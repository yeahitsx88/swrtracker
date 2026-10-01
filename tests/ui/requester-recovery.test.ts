import test from 'node:test';
import assert from 'node:assert/strict';
import { RetryableMutation } from '@/lib/retryable-mutation';
import { ApiClientError } from '@/lib/errors';
import { formatCalendarDate } from '@/lib/calendar-date';
test('an uncertain mutation retries the frozen body and key, never a new request', async () => {
  const command = new RetryableMutation<{ description:string }>();
  const attempts: { input:{ description:string }; key:string }[] = [];
  const send = async (input:{ description:string }, key:string) => { attempts.push({ input,key }); if (attempts.length===1) throw new TypeError('Connection lost'); return 'saved'; };
  await assert.rejects(() => command.run({ description:'First' },send));
  assert.ok(command.pending);
  await assert.rejects(() => command.run({ description:'Changed' },send), /Retry the unconfirmed action/);
  assert.equal(attempts.length,1);
  assert.equal(await command.run({ description:'First' },send),'saved');
  assert.deepEqual(attempts[0],attempts[1]); assert.equal(command.pending,null);
});
test('definitive validation clears retry state, while a server error retains it', async () => {
  const command = new RetryableMutation<{ date:string }>();
  await assert.rejects(() => command.run({ date:'' },async () => { throw new ApiClientError('ValidationError','Required',400); }));
  assert.equal(command.pending,null);
  await assert.rejects(() => command.run({ date:'2028-02-29' },async () => { throw new ApiClientError('InternalError','Unconfirmed',500); }));
  assert.ok(command.pending);
});
test('Need-By formatting preserves date-only semantics and missing draft dates', () => {
  assert.equal(formatCalendarDate('2028-02-29T00:00:00.000Z'),'Feb 29, 2028');
  assert.equal(formatCalendarDate(null),'Not set');
});
