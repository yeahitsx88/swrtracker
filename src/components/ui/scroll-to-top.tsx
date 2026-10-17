'use client';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {usePathname} from 'next/navigation';
type Surface={target:Element|null;portal:Element;left:number;top:number;page:boolean};
/** Discovers actual overflow rather than requiring per-screen arrows. Dialog portals stay in the native top layer. */
export function ScrollToTop(){
 const pathname=usePathname(),administration=/\/admin(?:\/|$)/.test(pathname);
 const [surfaces,setSurfaces]=useState<Surface[]>([]);
 useEffect(()=>{
 let frame=0,stopped=false;
 const update=()=>{
 frame=0;if(stopped)return;if(administration){setSurfaces([]);return;}
 const next:Surface[]=[];const modal=document.querySelector('dialog[open]');
 if(!modal&&window.scrollY>300&&document.documentElement.scrollHeight>innerHeight+80)next.push({target:null,portal:document.body,left:innerWidth-60,top:innerHeight-60,page:true});
 document.querySelectorAll<HTMLElement>('body *').forEach(target=>{
 if(target.closest('.scroll-to-top')||target.scrollTop<300||target.scrollHeight<=target.clientHeight+80)return;
 const style=getComputedStyle(target);if(!['auto','scroll'].includes(style.overflowY))return;
 const rect=target.getBoundingClientRect();if(rect.width<70||rect.height<70||rect.bottom<80||rect.top>innerHeight)return;
 const dialog=target.closest('dialog');if(dialog&&!dialog.open)return;if(modal&&!dialog)return;
 const portal=dialog??document.body,base=dialog?.getBoundingClientRect();
 next.push({target,portal,left:Math.min(rect.right,innerWidth)-(base?.left??0)-60,top:dialog?.classList.contains('popout-dialog')?(base!.height-60):Math.min(rect.bottom,innerHeight)-(base?.top??0)-60,page:false});
 });
 setSurfaces(old=>old.length===next.length&&old.every((s,i)=>s.target===next[i]?.target&&s.left===next[i]?.left&&s.top===next[i]?.top)?old:next);
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
 const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','open']});
 const resize=new ResizeObserver(schedule);resize.observe(document.body);
 document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);schedule();
 return()=>{stopped=true;if(frame)cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
 },[administration]);
 return <>{surfaces.map((surface,index)=>createPortal(<button key={index} type="button" className="button scroll-to-top" aria-label="Back to top"
 style={{position:surface.portal.tagName==='DIALOG'?'absolute':'fixed',left:surface.left,top:surface.top}}
 onClick={()=>{const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';if(surface.target)surface.target.scrollTo({top:0,behavior});else window.scrollTo({top:0,behavior});}}>
 <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v15"/></svg>
 </button>,surface.portal))}</>;
}
