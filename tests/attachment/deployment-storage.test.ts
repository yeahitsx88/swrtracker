import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Docker image and Compose mount agree on the private durable attachment root',()=>{
  const image=readFileSync('Dockerfile','utf8');const compose=readFileSync('docker-compose.yml','utf8');
  assert.match(image,/ENV SWR_ATTACHMENT_ROOT=\/var\/lib\/swr\/attachments/);
  assert.match(image,/chmod 700 \/var\/lib\/swr\/attachments/);assert.match(image,/USER node/);
  const web=compose.split('  notification-worker:')[0]??'';
  assert.match(web,/SWR_ATTACHMENT_ROOT: \/var\/lib\/swr\/attachments/);
  assert.match(web,/swr-attachments:\/var\/lib\/swr\/attachments/);
  assert.match(compose,/\nvolumes:\r?\n  swr-attachments:/);
});
