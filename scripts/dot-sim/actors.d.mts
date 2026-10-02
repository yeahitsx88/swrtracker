import type {Identity} from './policy.mjs';
export interface Trace {runId:string;actorId:string;syntheticName:string;role:string;action:string;timestamp:string;projectId?:string;requestId?:string;observedCapabilities?:Record<string,unknown>;httpStatus:number|null;success:boolean;correlationId:string;idempotencyKey?:string}
export const actions: Readonly<Record<string,(input:Record<string,unknown>)=>unknown[]>>;
export class ActorHttpError extends Error {status:number;type:string;code?:string;constructor(action:string,status:number,type?:string,code?:string)}
export class DotActor {
  constructor(options:{identity:Identity;baseUrl:string;runId:string;trace?:(record:Trace)=>void;fetchImpl?:typeof fetch});
  readonly actorId:string;readonly hasSession:boolean;
  register(inviteToken:string):Promise<Record<string,any>>;
  login():Promise<Record<string,any>>;
  logout():Promise<Record<string,any>>;
  act(action:string,input?:Record<string,unknown>,options?:{key?:string}):Promise<Record<string,any>>;
}
