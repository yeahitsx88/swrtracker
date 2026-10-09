import {access} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

// Static imports run this preflight before a browser runner can mutate fixtures.
const requested=process.env.SWR_PLAYWRIGHT_MODULE;
if(!requested)throw new Error('SWR_PLAYWRIGHT_MODULE is required: supply an absolute Playwright module path or file URL before fixture setup.');
if(!requested.startsWith('file:')&&!isAbsolute(requested))throw new Error('SWR_PLAYWRIGHT_MODULE must be an absolute module path or file URL.');
export const playwrightModuleURL=requested.startsWith('file:')?new URL(requested).href:pathToFileURL(requested).href;
try{await access(new URL(playwrightModuleURL));await import(playwrightModuleURL);}
catch(error){throw new Error('SWR_PLAYWRIGHT_MODULE is unavailable or cannot be imported; fixture mutation was not started.',{cause:error});}
