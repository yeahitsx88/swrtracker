// Run twice in separate, non-root image containers with the same synthetic volume.
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LocalAttachmentStorage } from '../../src/modules/attachment/infrastructure';
import type { UUID } from '../../src/shared/types';

async function main(){
  assert.equal(process.env.SWR_ATTACHMENT_ROOT,'/var/lib/swr/attachments');
  assert.equal(process.getuid?.(),1000,'must use image non-root node user');
  const storage=new LocalAttachmentStorage();
  const bytes=Buffer.from('SWR synthetic container replacement persistence fixture');
  if(process.argv[2]==='write'){
    const object=await storage.write('87000000-0000-4000-8000-000000000001' as UUID,'87000000-0000-4000-8000-000000000002' as UUID,bytes);
    assert.equal((await stat(path.join(process.env.SWR_ATTACHMENT_ROOT,object.storageKey))).mode&0o777,0o600);
    assert.equal((await stat(process.env.SWR_ATTACHMENT_ROOT)).mode&0o777,0o700);
    console.log(JSON.stringify(object));
  }else{
    const key=process.env.SWR_PERSIST_KEY;assert.ok(key);
    const read=await storage.read(key);assert.deepEqual(read,bytes);
    assert.equal(createHash('sha256').update(read).digest('hex'),process.env.SWR_PERSIST_HASH);
    console.log('Synthetic attachment bytes and digest survived separate container replacement; non-root and private permissions verified.');
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Persistence check failed');process.exitCode=1;});
