import type {ReactNode} from 'react';
import {TenantAccountsWorkspace} from './workspace';
import {cookies} from 'next/headers';
import {NextRequest} from 'next/server';
import Link from 'next/link';
import {requireActiveAuth} from '@/lib/auth';
import {getTenantRole} from '@/lib/get-tenant-role';
import {pool} from '@/lib/db';
export default async function TenantAdministrationLayout({children}:{children:ReactNode}){
 const auth=await requireActiveAuth(new NextRequest('http://swr.internal/',{headers:{cookie:(await cookies()).toString()}}));
 if(await getTenantRole(pool,auth.tenantId,auth.userId,auth.sessionVersion)!=='TENANT_ADMIN')return <section className="panel stack"><h1>Tenant Administration Unavailable</h1><p>Your account does not have Tenant Admin access. Return to your project to continue your work.</p><Link className="app-link" href="/projects">Return to Projects</Link></section>;
 return <><TenantAccountsWorkspace/>{children}</>;
}
