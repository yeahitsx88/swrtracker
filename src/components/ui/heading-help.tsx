'use client';

import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Icon} from './icon';
import './heading-help.css';

/** Supplemental guidance: hover, focus or tap; native popover handles Escape/outside dismissal. */
export function HelpHint({label,children}:{label:string;children:ReactNode}) {
  const id=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const popup=useRef<HTMLDivElement>(null);
  const timer=useRef<ReturnType<typeof setTimeout>>(undefined);
  const pinned=useRef(false);
  const dismissed=useRef(false);
  const [open,setOpen]=useState(false);
  const [position,setPosition]=useState({left:16,top:16});
  function cancel(){if(timer.current)clearTimeout(timer.current);}
  function place(){
    const button=trigger.current?.getBoundingClientRect(),box=popup.current?.getBoundingClientRect();
    if(!button||!box)return;
    setPosition({left:Math.max(16,Math.min(button.left,window.innerWidth-box.width-16)),top:button.bottom+6+box.height<=window.innerHeight-16?button.bottom+6:Math.max(16,button.top-box.height-6)});
  }
  function show(){cancel();if(dismissed.current)return;popup.current?.showPopover();place();}
  function hide(){cancel();popup.current?.hidePopover();}
  function leave(){cancel();if(!pinned.current)timer.current=setTimeout(hide,180);}
  useEffect(()=>{
    if(!open)return;
    window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open]);
  useEffect(()=>()=>cancel(),[]);
  return <>
    <button ref={trigger} type="button" className="heading-help-trigger" aria-label={`About ${label}`} aria-describedby={id} aria-expanded={open}
      onPointerEnter={event=>{if(event.pointerType!=='touch'){dismissed.current=false;show();}}}
      onPointerLeave={leave} onFocus={()=>{dismissed.current=false;show();}}
      onBlur={()=>{if(!pinned.current)leave();}}
      onClick={()=>{if(pinned.current&&open){pinned.current=false;dismissed.current=true;hide();}else{pinned.current=true;dismissed.current=false;show();}}}
      onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();pinned.current=false;dismissed.current=true;hide();}}}>
      <Icon name="help"/>
    </button>
    <div ref={popup} id={id} role="tooltip" popover="auto" className="heading-help-popover" style={position}
      onToggle={event=>{const visible=(event.nativeEvent as ToggleEvent).newState==='open';setOpen(visible);if(!visible){pinned.current=false;dismissed.current=true;}}}
      onPointerEnter={cancel} onPointerLeave={leave}>{children}</div>
  </>;
}

export function HeadingHelp({heading,label,help}:{heading:ReactNode;label:string;help?:ReactNode}) {
  return <div className="heading-with-help">{heading}{help&&<HelpHint label={label}>{help}</HelpHint>}</div>;
}
