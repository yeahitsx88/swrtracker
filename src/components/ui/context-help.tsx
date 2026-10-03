'use client';

import {useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import './context-help.css';

/** Optional guidance is available by pointer, keyboard and touch. */
export function ContextHelp({label,children}:{label:string;children:ReactNode}) {
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),content=useRef<HTMLDivElement>(null);
  const [pinned,setPinned]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[dismissed,setDismissed]=useState(false);
  const [position,setPosition]=useState({left:16,top:16,width:416,maxHeight:400});
  const visible=(pinned||hovered||focused)&&!dismissed;
  useLayoutEffect(()=>{
    if(!visible)return;
    function place(){
      if(!trigger.current||!content.current)return;
      const rect=trigger.current.getBoundingClientRect(),width=Math.min(416,window.innerWidth-32),maxHeight=window.innerHeight-32;
      const height=Math.min(content.current.getBoundingClientRect().height,maxHeight);
      const left=Math.max(16,Math.min(rect.left,window.innerWidth-width-16));
      const top=rect.bottom+height<=window.innerHeight-16?rect.bottom:rect.top-height>=16?rect.top-height:Math.max(16,window.innerHeight-height-16);
      setPosition({left,top,width,maxHeight:Math.max(64,window.innerHeight-top-16)});
    }
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[visible]);
  return <div className="context-help" data-open={visible}
    onPointerEnter={()=>{setHovered(true);setDismissed(false);}} onPointerLeave={()=>{setHovered(false);setDismissed(false);}}
    onKeyDown={event=>{if(event.key==='Escape'){setPinned(false);setDismissed(true);event.preventDefault();event.stopPropagation();}}}>
    <button ref={trigger} type="button" className="context-help-trigger" aria-label={`Help: ${label}`} aria-describedby={id}
      aria-expanded={visible} onFocus={()=>{setFocused(true);setDismissed(false);}} onClick={()=>{setPinned(value=>!value);setDismissed(pinned);}}
      onBlur={event=>{if(!event.currentTarget.parentElement?.contains(event.relatedTarget)){setFocused(false);setPinned(false);setDismissed(false);}}}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 1.75-2.5 3.5"/><path d="M12 16v.5"/></svg>
    </button>
    <div ref={content} id={id} role="tooltip" className="context-help-content" style={position}>{children}</div>
  </div>;
}
