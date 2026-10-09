import type {ReactNode} from 'react';
import {AdminProjectWorkspace} from './workspace';
import {cookies} from 'next/headers';
import {NextRequest} from 'next/server';
import Link from 'next/link';
import {requireActiveAuth} from '@/lib/auth';
import {resolveProjectCapabilities} from '@/lib/project-capabilities';
import {pool} from '@/lib/db';
import type {UUID} from '@/shared/types';
export default async function AdminLayout({children,params}:{children:ReactNode;params:Promise<{projectId:string}>}){
 const {projectId}=await params;
 const auth=await requireActiveAuth(new NextRequest('http://swr.internal/',{headers:{cookie:(await cookies()).toString()}}));
 const capabilities=await resolveProjectCapabilities(pool,auth,projectId as UUID);
 if(!capabilities.canAdminister)return <section className="panel stack"><h1>Project Administration Unavailable</h1><p>Your account does not have Project Admin access. Return to your project to continue your work.</p><Link className="app-link" href={`/projects/${projectId}/home`}>Return to Project</Link></section>;
 return <><AdminProjectWorkspace/>{children}</>;
}
