 'use client';
import {Children,isValidElement,useEffect,useRef,useState,type ReactNode} from 'react';
import {Button} from './button';

export function HomeWidgets({children,storageKey,audience}:{children:ReactNode;storageKey:string;audience:string}){
 const widgets=Children.toArray(children).filter(isValidElement).map((node,index)=>({id:String((node.props as {title?:string}).title??index),node}));
 const ids=widgets.map(widget=>widget.id),signature=ids.join('|');
 const pointer=useRef<{id:string;x:number;y:number}|null>(null);
 const [order,setOrder]=useState<string[]>([]),[loaded,setLoaded]=useState('');
 const [editing,setEditing]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  let saved:unknown;try{saved=JSON.parse(localStorage.getItem(`swr:widgets:${storageKey}`)??'null');}catch{}
  const current=signature.split('|');
  setOrder(Array.isArray(saved)?[...new Set(saved.filter((id):id is string=>typeof id==='string'&&current.includes(id)))]:current);
  setLoaded(storageKey);
 },[storageKey,signature]);
 const arranged=[...order.filter(id=>ids.includes(id)),...ids.filter(id=>!order.includes(id))];
 useEffect(()=>{if(loaded!==storageKey)return;try{localStorage.setItem(`swr:widgets:${storageKey}`,JSON.stringify(order));}catch{}},[order,loaded,storageKey]);
 function move(id:string,target:string){
  if(id===target)return;
  const next=[...arranged];const from=next.indexOf(id),to=next.indexOf(target);if(from<0||to<0)return;
  next.splice(from,1);next.splice(to,0,id);setOrder(next);setMessage(`${id} moved to position ${to+1} of ${next.length}.`);
 }
 return <section className="home-widget-board" aria-label="Dashboard widgets">
 <div className="row home-widget-tools"><Button variant="secondary" aria-pressed={editing} onClick={()=>setEditing(value=>!value)}>{editing?'Done arranging':'Arrange dashboard'}</Button>{editing&&<><span className="muted">Drag a Move button, or use Earlier and Later. Saved in this browser.</span><Button variant="secondary" onClick={()=>{setOrder(ids);setMessage('Default dashboard order restored.');}}>Reset dashboard</Button></>}</div>
 <span role="status" className="sr-only">{message}</span>
 <div className="home-dashboard-grid home-movable-widgets" data-audience={audience}>
 {arranged.map((id,index)=><div className="home-widget" key={id} data-widget={id}>
 {editing&&<div className="row home-widget-actions"><button className="button button-secondary" type="button" style={{touchAction:'none'}} onPointerDown={event=>{if(event.button!==0)return;pointer.current={id,x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerCancel={()=>{pointer.current=null;}} onPointerUp={event=>{const start=pointer.current;pointer.current=null;if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)<6)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-widget]')?.dataset.widget;if(target)move(start.id,target);}} aria-label={`Move ${id}`}>Move</button><Button variant="secondary" disabled={index===0} aria-label={`Move ${id} earlier`} onClick={()=>move(id,arranged[index-1]!)}>Earlier</Button><Button variant="secondary" disabled={index===arranged.length-1} aria-label={`Move ${id} later`} onClick={()=>move(id,arranged[index+1]!)}>Later</Button></div>}
 {widgets.find(widget=>widget.id===id)!.node}
 </div>)}
 </div></section>;
}
