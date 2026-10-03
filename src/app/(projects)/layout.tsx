import type {ReactNode} from 'react';
import {cookies} from 'next/headers';
import {NextRequest} from 'next/server';
import {redirect} from 'next/navigation';
import {AccountShell} from '@/components/ui/account-menu';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {UnauthorizedError} from '@/shared/errors';
import {readAppearance} from '@/modules/identity/application/appearance';
import {SqlAppearanceStore} from '@/modules/identity/infrastructure/appearance.store';
export default async function ProjectsRootLayout({children}:{children:ReactNode}){
 try{const auth=await requireActiveAuth(new NextRequest('http://swr.internal/',{headers:{cookie:(await cookies()).toString()}}));const initialAppearance=await readAppearance(new SqlAppearanceStore(),pool,auth);return <AccountShell initialAppearance={initialAppearance}>{children}</AccountShell>;}
 catch(error){if(error instanceof UnauthorizedError)redirect('/login');throw error;}
}
