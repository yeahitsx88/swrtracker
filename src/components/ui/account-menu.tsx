'use client';
import type {Appearance} from '@/modules/identity/application/appearance';
import {AppearanceTheme} from './appearance-theme';
import {useParams,usePathname} from 'next/navigation';
import {useEffect,useState,type ReactNode} from 'react';
import {apiClient} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import {ProductBrand} from './product-brand';
import {ProjectShellHeader} from './project-shell-header';
import {ScrollToTop} from './scroll-to-top';
import './account-menu.css';

export function AccountShell({children,initialAppearance}:{children:ReactNode;initialAppearance?:Appearance}) {
  const params=useParams<{projectId?:string}>();
  const pathname=usePathname();
  const [context,setContext]=useState<string>();
  const [name,setName]=useState<string>();
  const [accountError,setAccountError]=useState<string>();
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const explicit=params.projectId??new URLSearchParams(window.location.search).get('projectId')??undefined;
    let remembered:string|undefined;
    try { remembered=window.sessionStorage.getItem('swr-workspace-project')??undefined; } catch { /* Navigation still works with explicit link context. */ }
    setContext(explicit??remembered);
  },[pathname,params.projectId]);
  useEffect(()=>{
    let active=true;
    setAccountError(undefined);
    apiClient.getMyAccount().then(account=>{if(active)setName(account.name);})
      .catch(cause=>{if(active)setAccountError(getErrorMessage(cause,'Unable to load your greeting. Retry your account details.'));});
    return()=>{active=false;};
  },[revision]);
  return <div className="application-shell" data-mode={initialAppearance?.mode}><AppearanceTheme initial={initialAppearance}/>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="app-nav"><div className="app-nav-inner"><div className="account-identity">
      <ProductBrand greeting={name?.trim()?`Hello, ${name}!`:'Welcome!'}/>
      {accountError&&<div className="account-greeting-error"><span role="alert">{accountError}</span><button type="button" className="app-link" onClick={()=>setRevision(value=>value+1)}>Retry greeting</button></div>}
    </div></div></header>
    <ScrollToTop/>
    <div className="application-workspace"><main id="main-content" tabIndex={-1}><div className="page-shell">
      <ProjectShellHeader projectId={params.projectId??context} requireProject={!!params.projectId}>{children}</ProjectShellHeader>
    </div></main></div>
  </div>;
}
