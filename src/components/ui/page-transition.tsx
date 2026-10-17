'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';

/** Animate the new content without remounting forms or delaying navigation. */
export function PageTransition({children,hidden=false}:{children:ReactNode;hidden?:boolean}) {
  const pathname=usePathname(),container=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const animation=container.current?.animate([{opacity:0},{opacity:1}],{duration:180,easing:'ease-out'});
    return ()=>animation?.cancel();
  },[pathname]);
  return <div className="project-page" ref={container} hidden={hidden}>{children}</div>;
}
