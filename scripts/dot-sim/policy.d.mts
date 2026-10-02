export const names: Readonly<{db:string;web:string;network:string;database:string;postgres:string;attachments:string;appImage:string;checksImage:string;port:number;label:string;ownerLabel:string}>;
export interface Runtime {schema:1;ownerId:string;tenantId:string;controlTenantId:string;baseUrl:string;dbPassword:string;jwtSecret:string}
export interface Identity {key:string;id:string;tenantId:string;companyId:string;name:string;email:string;password:string;role:string}
export interface Population {schema:1;ownerId:string;companies:Array<{key:string;id:string;tenantId:string;name:string;type:string}>;actors:Identity[]}
export function validateRuntime(config:unknown): Runtime;
export function databaseUrl(config:Runtime):string;
export function assertDatabaseTarget(value:string,guard:string|undefined):void;
export function assertOwner(info:unknown,config:Runtime,kind:string):void;
export function assertLocalBase(value:string):string;
export function newRuntime():Runtime;
export function newPopulation(config:Runtime):Population;
export function validatePopulation(population:unknown,config:Runtime):Population;
export function assertLocalDockerTarget(value:string):void;
export function assertDataRoot(checkout:string,root:string):void;
export function assertDatabaseMarker(rows:Array<{owner_id:string;kind:string;version:number;tenant_id:string}>,config:Runtime):void;
