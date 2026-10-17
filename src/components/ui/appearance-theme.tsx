'use client';
import {useEffect} from 'react';
import type {Appearance} from '@/modules/identity/application/appearance';

function luminance(hex:string){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i]!,0);}
function readable(hex:string,dark:boolean){
 const target=dark?'#e7edf2':'#202a33',background=dark?'#19242e':'#ffffff';
 let current=hex;
 for(let n=0;n<=100;n++){
  const a=luminance(current),b=luminance(background);if((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>=4.5)return current;
  const t=(n+1)/100;current='#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-t)+parseInt(target.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
 }
 return target;
}
export function applyAppearance(value:Appearance){
 const root=document.documentElement,dark=value.mode==='DARK'||value.mode==='SYSTEM'&&matchMedia('(prefers-color-scheme: dark)').matches;
 root.dataset.theme=dark?'dark':'light';root.style.setProperty('--brand',value.branding.primary);root.style.setProperty('--accent',value.branding.accent);
 // Preserve the selected brand hue while deriving accessible text/link and button colors.
 const primary=value.branding.version===0&&value.branding.primary.toLowerCase()==='#315f85'?'#0b4bb3':value.branding.primary;
 const action=readable(primary,dark),level=luminance(action);
 const lightInk=1.05/(level+0.05)>=(level+0.05)/(luminance('#111820')+0.05);
 const hover='#'+[1,3,5].map(i=>Math.round(parseInt(action.slice(i,i+2),16)*0.84+(lightInk?0:255)*0.16).toString(16).padStart(2,'0')).join('');
 root.style.setProperty('--action',action);root.style.setProperty('--action-hover',hover);
 root.style.setProperty('--brand-ink',lightInk?'#ffffff':'#111820');
}
export function AppearanceTheme({initial}:{initial?:Appearance}){
 useEffect(()=>{
  let active=true,current:Appearance|undefined=initial,epoch=0;
  if(initial)applyAppearance(initial);
  const refresh=()=>{const version=++epoch;fetch('/api/account/appearance',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Appearance unavailable');return r.json() as Promise<Appearance>;}).then(value=>{if(active&&version===epoch){current=value;delete document.documentElement.dataset.appearanceUnavailable;applyAppearance(value);}}).catch(()=>{if(active)document.documentElement.dataset.appearanceUnavailable='true';});};
  const changed=(event:Event)=>{epoch++;current=(event as CustomEvent<Appearance>).detail;applyAppearance(current);};
  const media=matchMedia('(prefers-color-scheme: dark)'),system=()=>{if(current)applyAppearance(current);};
  refresh();window.addEventListener('swr-appearance',changed);window.addEventListener('focus',refresh);media.addEventListener('change',system);
  return()=>{active=false;window.removeEventListener('swr-appearance',changed);window.removeEventListener('focus',refresh);media.removeEventListener('change',system);delete document.documentElement.dataset.theme;for(const key of ['--brand','--accent','--action','--action-hover','--brand-ink'])document.documentElement.style.removeProperty(key);};
 },[]);
 return null;
}
