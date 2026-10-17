import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
async function files(dir){const found=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())found.push(...await files(path));else if(path.endsWith('.mjs'))found.push(path);}return found;}
const runners=[...await files('tests'),...await files('scripts')].sort();
for(const file of runners){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(result.status,0,file+'\n'+result.stderr);}
console.log('Syntax checked '+runners.length+' maintained and archived acceptance modules. Browser correctness is a separate gate.');
