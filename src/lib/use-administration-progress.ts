'use client';
import {useEffect,useSyncExternalStore} from 'react';
import type {CommandOwner} from './frozen-command';
/** Same-layout tabs retain the command; leaving it may not discard an uncertain attempt. */
export function useAdministrationProgress(owner:CommandOwner,root:string){
 const held=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot)!==null;
 useEffect(()=>{
  if(!held)return;
  const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  const link=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   const target=event.target instanceof Element?event.target.closest('a[href]'):null;
   if(!(target instanceof HTMLAnchorElement)||target.target==='_blank'||target.hasAttribute('download'))return;
   const destination=new URL(target.href,window.location.href);
   if(destination.origin===window.location.origin&&(destination.pathname===root||destination.pathname.startsWith(root+'/')))return;
   event.preventDefault();event.stopPropagation();window.alert('Finish, retry, or deliberately reload the active administration action before leaving this workspace.');
  };
  window.addEventListener('beforeunload',unload);document.addEventListener('click',link,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',link,true);};
 },[held,root]);
}
