import type {AppearanceStore,DisplayMode} from '../application/appearance';
import type {AuthContext} from '@/lib/auth';
import type {DbClient} from '@/shared/types';
export class SqlAppearanceStore implements AppearanceStore {
 async read(db:DbClient,auth:AuthContext){
  const {rows}=await db.query<{mode:DisplayMode;primary_color:string;accent_color:string;version:number}>(`SELECT COALESCE(a.mode,'SYSTEM') AS mode, COALESCE(b.primary_color,'#315f85') AS primary_color, COALESCE(b.accent_color,'#ffa500') AS accent_color, COALESCE(b.version,0) AS version FROM users u LEFT JOIN user_appearance a ON a.tenant_id=u.tenant_id AND a.user_id=u.id LEFT JOIN tenant_appearance b ON b.tenant_id=u.tenant_id WHERE u.tenant_id=$1 AND u.id=$2`,[auth.tenantId,auth.userId]);
  if(!rows[0])throw new Error('Current appearance account is unavailable');
  const r=rows[0];return {mode:r.mode,branding:{primary:r.primary_color,accent:r.accent_color,version:r.version}};
 }
 async personal(db:DbClient,auth:AuthContext,mode:DisplayMode){await db.query(`INSERT INTO user_appearance(tenant_id,user_id,mode) VALUES($1,$2,$3) ON CONFLICT(tenant_id,user_id) DO UPDATE SET mode=EXCLUDED.mode,updated_at=NOW()`,[auth.tenantId,auth.userId,mode]);}
 async brand(db:DbClient,auth:AuthContext,primary:string,accent:string,version:number){
  const {rows}=version===0?await db.query(`INSERT INTO tenant_appearance(tenant_id,primary_color,accent_color) VALUES($1,$2,$3) ON CONFLICT(tenant_id) DO NOTHING RETURNING tenant_id`,[auth.tenantId,primary,accent]):await db.query(`UPDATE tenant_appearance SET primary_color=$2,accent_color=$3,version=version+1,updated_at=NOW() WHERE tenant_id=$1 AND version=$4 RETURNING tenant_id`,[auth.tenantId,primary,accent,version]);
  return rows.length===1;
 }
}
