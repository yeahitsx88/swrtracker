import './next-async-storage';
import {workAsyncStorage} from 'next/dist/server/app-render/work-async-storage.external';
import type {WorkStore} from 'next/dist/server/app-render/work-async-storage.external';

/** Direct-handler business units supply the Next request scheduling context.
 * They do not run database telemetry against their mocked business repositories.
 * Actual after callbacks are exercised by reconciliation HTTP acceptance.
 */
export function inUnitRequestScope<A extends unknown[],R>(handler:(...args:A)=>Promise<R>){
 return (...args:A):Promise<R>=>workAsyncStorage.run({afterContext:{after(){}}} as unknown as WorkStore,()=>handler(...args));
}
