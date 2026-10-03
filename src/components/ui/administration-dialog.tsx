'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
import {Button} from './button';
import './popout.css';
import './administration-dialog.css';

let scrollLocks=0;
let previousOverflow='';

/** Shared foreground task surface. Callers retain command state and decide when closing is safe. */
export function AdministrationDialog({title,description,children,footer,onClose,closeDisabled=false,step}:{
  title:string;description?:string;children:ReactNode;footer?:ReactNode;onClose:()=>void;closeDisabled?:boolean;
  step?:{current:number;total:number;label:string};
}) {
  const id=useId(),dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const backdrop=useRef(false),closeState=useRef({onClose,closeDisabled});closeState.current={onClose,closeDisabled};
  useEffect(()=>{
    const element=dialog.current,trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(!element)return;
    if(scrollLocks++===0){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
    element.showModal();heading.current?.focus({preventScroll:true});
    return()=>{element.close();if(--scrollLocks===0)document.body.style.overflow=previousOverflow;if(trigger?.isConnected)trigger.focus({preventScroll:true});};
  },[]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});dialog.current?.querySelector('.popout-body')?.scrollTo({top:0});},[step?.current]);
  function close(){if(!closeState.current.closeDisabled)closeState.current.onClose();}
  return <dialog ref={dialog} className="popout-dialog administration-dialog" aria-labelledby={`${id}-title`}
    aria-describedby={description?`${id}-description`:undefined}
    onCancel={event=>{event.preventDefault();close();}}
    onPointerDown={event=>{backdrop.current=event.target===event.currentTarget;}}
    onClick={event=>{if(backdrop.current&&event.target===event.currentTarget)close();backdrop.current=false;}}>
    <header className="popout-header"><div className="stack administration-dialog-title"><h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{title}</h2>
      {step&&<p className="muted" role="status">Step {step.current} of {step.total} · {step.label}</p>}</div>
      <Button variant="secondary" disabled={closeDisabled} onClick={close}>Close</Button></header>
    <div className="popout-body stack">{description&&<p id={`${id}-description`}>{description}</p>}{children}</div>
    {footer&&<footer className="administration-dialog-footer">{footer}</footer>}
  </dialog>;
}
