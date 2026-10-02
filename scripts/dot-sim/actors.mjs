import { randomUUID } from 'node:crypto';
import { assertLocalBase } from './policy.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = value => { if (!uuid.test(value ?? '')) throw new Error('A valid resource ID is required'); return value; };
// These adapters describe HTTP shapes only. Authorization and business rules remain in SWRTracker.
export const actions = Object.freeze({
  listProjects: () => ['GET', '/api/projects'],
  inviteRequester: ({projectId, ...body}) => ['POST', `/api/projects/${id(projectId)}/invites`, body],
  createProject: input => ['POST', '/api/projects', input],
  capabilities: input => ['GET', `/api/projects/${id(input.projectId)}/capabilities`],
  listMembers: input => ['GET', `/api/projects/${id(input.projectId)}/members`],
  companies: input => ['GET', `/api/projects/${id(input.projectId)}/companies`],
  associateCompany: ({projectId, ...body}) => ['POST', `/api/projects/${id(projectId)}/companies`, {...body, confirmed:true}],
  addMember: ({projectId, ...body}) => ['POST', `/api/projects/${id(projectId)}/members`, body],
  grantAdministrator: ({projectId, ...body}) => ['POST', `/api/projects/${id(projectId)}/administrators`, {...body, confirmed:true}],
  createAreaLevel: ({projectId, ...body}) => ['POST', `/api/projects/${id(projectId)}/aor`, {kind:'LEVEL',...body}],
  createArea: ({projectId, ...body}) => ['POST', `/api/projects/${id(projectId)}/aor`, {kind:'NODE',...body}],
  assignArea: ({projectId, ...body}) => ['POST', `/api/projects/${id(projectId)}/aor/assignments`, {kind:'USER',...body}],
  configureProject: ({projectId, ...body}) => ['PATCH', `/api/projects/${id(projectId)}/request-config`, body],
  activateProject: ({projectId, ...body}) => ['POST', `/api/projects/${id(projectId)}/activate`, body],
  staffingSnapshot: input => ['GET', `/api/projects/${id(input.projectId)}/survey/staffing?mode=snapshot`],
  staffCrew: ({projectId, ...body}) => ['POST', `/api/projects/${id(projectId)}/survey/staffing`, body],
  createRequest: input => ['POST', '/api/tickets', input],
  viewRequest: input => ['GET', `/api/tickets/${id(input.ticketId)}`],
  saveDraft: ({ticketId, ...body}) => ['PATCH', `/api/tickets/${id(ticketId)}`, body],
  submitRequest: ({ticketId, ...body}) => ['POST', `/api/tickets/${id(ticketId)}/submit`, body],
  approveRequest: ({ticketId, ...body}) => ['POST', `/api/tickets/${id(ticketId)}/approve`, body],
  assignCrew: ({ticketId, ...body}) => ['POST', `/api/tickets/${id(ticketId)}/assign`, body],
  startWork: input => ['POST', `/api/tickets/${id(input.ticketId)}/start`, {}],
  completeWork: input => ['POST', `/api/tickets/${id(input.ticketId)}/complete`, {}],
});
export class ActorHttpError extends Error {
  constructor(action, status, type = 'HttpError', code) {
    super(`${action} failed with HTTP ${status} (${type})`);
    this.name = 'ActorHttpError'; this.status = status; this.type = type; this.code = code;
  }
}
export class DotActor {
  #identity; #cookie; #projectRoles = new Map(); #base; #fetch; #trace; #runId; #queue = Promise.resolve();
  constructor({identity, baseUrl, runId, trace = () => {}, fetchImpl = fetch}) {
    this.#identity = structuredClone(identity); this.#base = assertLocalBase(baseUrl);
    this.#runId = runId; this.#trace = trace; this.#fetch = fetchImpl;
  }
  get actorId() { return this.#identity.id; }
  get hasSession() { return Boolean(this.#cookie); }
  // Calls for one actor serialize; different actors remain independent.
  #serialize(fn) { const pending = this.#queue.then(fn); this.#queue = pending.catch(() => {}); return pending; }
  async #request(action, method, path, body, key, target = {}) {
    const correlationId = randomUUID(); let status = null;
    try {
      const response = await this.#fetch(`${this.#base}${path}`, {method,
        headers: {'content-type':'application/json', 'x-correlation-id':correlationId,
          ...(this.#cookie ? {cookie:this.#cookie} : {}), ...(key ? {'Idempotency-Key':key} : {})},
        body: body === undefined ? undefined : JSON.stringify(body), redirect:'manual', signal:AbortSignal.timeout(15000)});
      status = response.status;
      if (status >= 300 && status < 400) throw new ActorHttpError(action,status,'RedirectRefused');
      const payload = await response.json();
      if (!response.ok) throw new ActorHttpError(action,status,payload?.error?.type,payload?.error?.code);
      if (action === 'login') {
        if (payload.user?.id !== this.#identity.id || payload.user?.tenantId !== this.#identity.tenantId) throw new Error('Actor login identity mismatch');
        const cookie = response.headers.get('set-cookie')?.split(';')[0];
        if (!cookie?.startsWith('swr_session=')) throw new Error('Actor login session missing');
        this.#cookie = cookie;
      }
      if (action === 'capabilities') {
        const c=payload.capabilities;
        const roles=['PROJECT_ADMIN','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','REQUESTER','VIEWER','CAD_LEAD','CAD_TECHNICIAN','AREA_VIEWER','DEPARTMENT_MANAGER','DEPARTMENT_LEAD','SUBCONTRACTS_COORDINATOR'];
        this.#projectRoles.set(target.projectId,{canAdminister:c?.canAdminister===true,centralIT:c?.centralIT===true,accessDisabled:c?.accessDisabled===true,
          operationalRole:roles.includes(c?.operationalRole)?c.operationalRole:null});
      }
      if (action === 'register') {
        if (payload.user?.tenantId !== this.#identity.tenantId || payload.user?.email !== this.#identity.email || !uuid.test(payload.user?.id)) throw new Error('Registered actor identity mismatch');
        this.#identity.id = payload.user.id;
      }
      if (action === 'logout') this.#cookie = undefined;
      this.#record(action,status,true,correlationId,key,target);
      return payload;
    } catch (error) {
      this.#record(action,status,false,correlationId,key,target);
      // Do not propagate transport messages or server bodies that could contain credentials.
      if (error instanceof ActorHttpError) throw error;
      throw new Error(`${action} failed before a confirmed result; inspect the local trace and retry deliberately`);
    }
  }
  #record(action,status,success,correlationId,key,target) {
    this.#trace({runId:this.#runId, actorId:this.actorId, syntheticName:this.#identity.name, role:this.#identity.role,
      action, timestamp:new Date().toISOString(), projectId:uuid.test(target.projectId ?? '') ? target.projectId : undefined, requestId:uuid.test(target.ticketId ?? '') ? target.ticketId : undefined, observedCapabilities:this.#projectRoles.get(target.projectId),
      httpStatus:status, success, correlationId, idempotencyKey:key});
  }
  login() { return this.#serialize(async () => {
    this.#cookie = undefined;
    return this.#request('login','POST','/api/auth/login',
      {tenantId:this.#identity.tenantId,email:this.#identity.email,password:this.#identity.password});
  }); }
  register(inviteToken) { return this.#serialize(() => this.#request('register','POST','/api/auth/register',
    {tenantId:this.#identity.tenantId,email:this.#identity.email,name:this.#identity.name,password:this.#identity.password,inviteToken})); }
  logout() { return this.#serialize(() => this.#request('logout','POST','/api/auth/logout',{})); }
  act(action, input = {}, {key} = {}) {
    // Freeze caller intent before queuing; retain explicit key on deliberate retries.
    const frozen = structuredClone(input);
    if (key !== undefined && !uuid.test(key)) return Promise.reject(new Error('Dot retry keys must be UUIDs'));
    return this.#serialize(() => {
      if (!Object.hasOwn(actions,action)) throw new Error('Unsupported dot action');
      const [method,path,body] = actions[action](frozen);
      return this.#request(action,method,path,body,method === 'GET' ? undefined : key ?? randomUUID(),frozen);
    });
  }
}
