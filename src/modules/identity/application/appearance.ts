import type {AuthContext} from '@/lib/auth';
import type {DbClient} from '@/shared/types';
import {ConflictError, ForbiddenError, ValidationError} from '@/shared/errors';
import {getTenantRole} from '@/lib/get-tenant-role';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';

export type DisplayMode = 'LIGHT'|'DARK'|'SYSTEM';
export interface Appearance {
 mode: DisplayMode; canBrand: boolean;
 branding: {primary: string; accent: string; version: number};
}
export interface AppearanceStore {
 read(db:DbClient,auth:AuthContext):Promise<Omit<Appearance,'canBrand'>>;
 personal(db:DbClient,auth:AuthContext,mode:DisplayMode):Promise<void>;
 brand(db:DbClient,auth:AuthContext,primary:string,accent:string,version:number):Promise<boolean>;
}
export async function readAppearance(store:AppearanceStore,db:DbClient,auth:AuthContext):Promise<Appearance> {
 return {...await store.read(db,auth),canBrand:await getTenantRole(db,auth.tenantId,auth.userId,auth.sessionVersion)==='TENANT_ADMIN'};
}
export function parseAppearanceCommand(value:unknown):{scope:'PERSONAL';mode:DisplayMode}|{scope:'TENANT';primary:string;accent:string;version:number} {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('Choose an appearance setting.');
 const body=value as Record<string,unknown>;
 if(body.scope==='PERSONAL'&&typeof body.mode==='string'&&['LIGHT','DARK','SYSTEM'].includes(body.mode))return {scope:'PERSONAL',mode:body.mode as DisplayMode};
 if(body.scope==='TENANT'&&typeof body.primary==='string'&&typeof body.accent==='string'&&/^#[0-9a-f]{6}$/i.test(body.primary)&&/^#[0-9a-f]{6}$/i.test(body.accent)&&Number.isSafeInteger(body.version)&&Number(body.version)>=0)
  return {scope:'TENANT',primary:body.primary.toLowerCase(),accent:body.accent.toLowerCase(),version:Number(body.version)};
 throw new ValidationError('Use a display mode or two six-digit hexadecimal branding colors and the current version.');
}
export async function authorizeAppearance(db:DbClient,auth:AuthContext,command:ReturnType<typeof parseAppearanceCommand>) {
 if(command.scope==='TENANT'&&await getTenantRole(db,auth.tenantId,auth.userId,auth.sessionVersion)!=='TENANT_ADMIN')throw new ForbiddenError('Only Central IT can change tenant branding.');
}
export async function changeAppearance(store:AppearanceStore,db:DbClient,auth:AuthContext,command:ReturnType<typeof parseAppearanceCommand>):Promise<Appearance> {
 await authorizeAppearance(db,auth,command);
 const before=await store.read(db,auth);
 if(command.scope==='PERSONAL')await store.personal(db,auth,command.mode);
 else if(!await store.brand(db,auth,command.primary,command.accent,command.version))throw new ConflictError('Branding changed. Reload before choosing new colors.');
 await appendAdministrativeEvent(db,{auth,projectId:null,subjectUserId:command.scope==='PERSONAL'?auth.userId:null,eventType:command.scope==='PERSONAL'?'account.appearance_changed':'tenant.appearance_changed',authorityEvidence:{scope:command.scope},changes:{before,command}});
 return readAppearance(store,db,auth);
}
