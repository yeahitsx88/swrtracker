'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
import {Button} from './button';
import {Icon} from './icon';
import {closePopup} from './popup-motion';
import './popout.css';
import './administration-dialog.css';

/** Native protected focus. A held command cannot be dismissed or replaced. */
export function AdministrationDialog({title,locked,onDismiss,children,className}:{title:string;locked:boolean;onDismiss:()=>void;children:ReactNode;className?:string}){
 const dialog=useRef<HTMLDialogElement>(null),headingId=useId();
 useEffect(()=>{const node=dialog.current,trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{node?.close();if(trigger?.isConnected)trigger.focus({preventScroll:true});};},[]);
 const dismiss=()=>{if(!locked)closePopup(dialog.current,onDismiss);};
 return <dialog ref={dialog} className={`administration-dialog popout-dialog ${className??''}`} aria-labelledby={headingId} onCancel={event=>{event.preventDefault();dismiss();}}>
  <div className="popout-header"><h2 id={headingId} className="panel-title" tabIndex={-1} autoFocus>{title}</h2><Button type="button" variant="secondary" className="icon-close" aria-label="Close review" disabled={locked} onClick={dismiss}><Icon name="close"/></Button></div>
  <div className="popout-body stack">{children}</div>
 </dialog>;
}
