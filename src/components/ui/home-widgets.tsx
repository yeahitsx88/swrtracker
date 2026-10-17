'use client';
import {Children,isValidElement,useCallback,useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {columnsOf,defaultLayout,moveCard,positionOf,restoreLayout,sameLayout,stepCard,type Column,type HomeLayout} from './home-layout';

const INTERACTIVE='a,button,input,select,textarea,summary,label,[role=button],[contenteditable],.home-widget-grip';
const STORAGE=(key:string)=>`swr:widgets:v2:${key}`,LEGACY=(key:string)=>`swr:widgets:${key}`;

function Grip(){
 return <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">{[5,10,15].flatMap(y=>[5,11].map(x=><circle key={`${x}-${y}`} cx={x} cy={y} r="1.3"/>))}</svg>;
}
function useColumnCount():1|2{
 const [count,setCount]=useState<1|2>(2);
 useEffect(()=>{const query=window.matchMedia('(min-width: 1200px)'),sync=()=>setCount(query.matches?2:1);sync();query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync);},[]);
 return count;
}
type Drag={id:string;pointerId:number;startX:number;startY:number;offsetX:number;offsetY:number;width:number;height:number;active:boolean;x:number;y:number};

/** Dashboard cards the user arranges by dragging a title bar or grip; saved in this browser. */
export function HomeWidgets({children,storageKey,audience}:{children:ReactNode;storageKey:string;audience:string}){
 const widgets=Children.toArray(children).filter(isValidElement).map((node,index)=>({id:String((node.props as {title?:string}).title??index),node}));
 const ids=widgets.map(widget=>widget.id),signature=ids.join('|');
 const count=useColumnCount();
 const [layout,setLayout]=useState<HomeLayout>(()=>defaultLayout(ids));
 const [preview,setPreview]=useState<HomeLayout|null>(null);
 const [drag,setDrag]=useState<Drag|null>(null);
 const [lifted,setLifted]=useState<{id:string;original:HomeLayout}|null>(null);
 const [message,setMessage]=useState('');
 const board=useRef<HTMLDivElement>(null),dragRef=useRef<Drag|null>(null),rects=useRef(new Map<string,DOMRect>());
 const previewRef=useRef<HomeLayout|null>(null),layoutRef=useRef(layout);layoutRef.current=layout;
 const loadedKey=useRef('');

 useEffect(()=>{
  const current=signature?signature.split('|'):[];
  let saved:unknown=null;
  try{saved=JSON.parse(localStorage.getItem(STORAGE(storageKey))??localStorage.getItem(LEGACY(storageKey))??'null');}catch{/* Storage may be unavailable; defaults apply. */}
  setLayout(restoreLayout(saved,current));loadedKey.current=storageKey;
 },[storageKey,signature]);
 const persist=useCallback((next:HomeLayout)=>{
  setLayout(next);
  try{localStorage.setItem(STORAGE(storageKey),JSON.stringify(next));localStorage.removeItem(LEGACY(storageKey));}catch{/* The layout still applies for this visit. */}
 },[storageKey]);

 const shown=preview??layout,columns=columnsOf(shown,count);
 const titleOf=(id:string)=>id;
 const describe=(next:HomeLayout,id:string)=>{const {column,index}=positionOf(next,id,count);return `${titleOf(id)}: ${count===2?`${column===0?'left':'right'} column, `:''}position ${index+1} of ${columnsOf(next,count)[column]!.length}.`;};

 // Smooth reflow: other cards glide from their previous position to the new one.
 const snapshot=()=>{rects.current=new Map([...board.current?.querySelectorAll<HTMLElement>('[data-widget]')??[]].map(node=>[node.dataset.widget!,node.getBoundingClientRect()]));};
 useLayoutEffect(()=>{
  if(!rects.current.size||window.matchMedia('(prefers-reduced-motion: reduce)').matches){rects.current.clear();return;}
  for(const node of board.current?.querySelectorAll<HTMLElement>('[data-widget]')??[]){
   const before=rects.current.get(node.dataset.widget!);if(!before||node.dataset.widget===dragRef.current?.id&&dragRef.current?.active)continue;
   const after=node.getBoundingClientRect(),dx=before.left-after.left,dy=before.top-after.top;
   if(!dx&&!dy)continue;
   node.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:160,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  rects.current.clear();
 },[shown]);

 function target(x:number,y:number,id:string):{column:Column;index:number}{
  const columnNodes=[...board.current?.querySelectorAll<HTMLElement>(':scope > [data-board-column]')??[]];
  let column:Column=0;
  if(count===2&&columnNodes.length===2){const right=columnNodes[1]!.getBoundingClientRect();column=x>=right.left-8?1:0;}
  const peers=[...(columnNodes[column]?.querySelectorAll<HTMLElement>(':scope > [data-widget]')??[])].filter(node=>node.dataset.widget!==id);
  const index=peers.findIndex(node=>{const r=node.getBoundingClientRect();return y<r.top+r.height/2;});
  return{column,index:index<0?peers.length:index};
 }
 const onMove=useCallback((event:PointerEvent)=>{
  const current=dragRef.current;if(!current||event.pointerId!==current.pointerId)return;
  if(!current.active){if(Math.hypot(event.clientX-current.startX,event.clientY-current.startY)<6)return;current.active=true;document.body.classList.add('home-dragging');}
  current.x=event.clientX;current.y=event.clientY;setDrag({...current});
  if(event.clientY<72)window.scrollBy(0,-14);else if(event.clientY>window.innerHeight-72)window.scrollBy(0,14);
  const place=target(event.clientX,event.clientY,current.id),base=previewRef.current??layoutRef.current,next=moveCard(base,current.id,place.column,place.index,count);
  if(sameLayout(next,base))return;
  snapshot();previewRef.current=next;setPreview(next);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[count]);
 const finish=useCallback((commit:boolean)=>{
  const current=dragRef.current;dragRef.current=null;document.body.classList.remove('home-dragging');
  window.removeEventListener('pointermove',onMove);
  const next=previewRef.current;previewRef.current=null;
  setDrag(null);setPreview(null);
  if(commit&&current?.active&&next&&!sameLayout(next,layoutRef.current)){persist(next);setMessage(`Moved ${describe(next,current.id)}`);}
  else if(current?.active)setMessage('Move cancelled. The layout is unchanged.');
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[onMove,persist]);
 useEffect(()=>{
  if(!drag)return;
  const up=(event:PointerEvent)=>{if(event.pointerId===dragRef.current?.pointerId)finish(true);};
  const cancel=()=>finish(false),escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape')finish(false);};
  window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',escape);window.addEventListener('blur',cancel);
  return()=>{window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',escape);window.removeEventListener('blur',cancel);};
 },[drag!==null,onMove,finish]);// eslint-disable-line react-hooks/exhaustive-deps

 // Keyboard move ends when focus leaves the lifted card's handle (re-mounts refocus the same handle).
 useEffect(()=>{
  if(!lifted)return;
  const leave=(event:FocusEvent)=>{const handle=(event.target as HTMLElement|null)?.closest?.('[data-widget]') as HTMLElement|null;if(handle?.dataset.widget===lifted.id&&(event.target as HTMLElement).classList.contains('home-widget-grip'))return;persist(layoutRef.current);setLifted(null);setMessage('Dropped where it was.');};
  document.addEventListener('focusin',leave);return()=>document.removeEventListener('focusin',leave);
 },[lifted,persist]);
 function start(event:ReactPointerEvent<HTMLDivElement>,id:string){
  if(event.button!==0||lifted||dragRef.current)return;
  const element=event.target as HTMLElement,fromGrip=!!element.closest('.home-widget-grip');
  const fromTitle=!!element.closest('.panel-header')&&!element.closest(INTERACTIVE)&&event.pointerType!=='touch';
  if(!fromGrip&&!fromTitle)return;
  const box=event.currentTarget.getBoundingClientRect();
  event.preventDefault();
  dragRef.current={id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-box.left,offsetY:event.clientY-box.top,width:box.width,height:box.height,active:false,x:event.clientX,y:event.clientY};
  setDrag({...dragRef.current});
 }
 function focusGrip(id:string){requestAnimationFrame(()=>board.current?.querySelector<HTMLElement>(`[data-widget="${CSS.escape(id)}"] .home-widget-grip`)?.focus());}
 function key(event:KeyboardEvent<HTMLButtonElement>,id:string){
  if(event.key===' '||event.key==='Enter'){
   event.preventDefault();
   if(!lifted){setLifted({id,original:layout});setMessage(`Picked up ${titleOf(id)}. ${describe(layout,id)} Use the arrow keys to move it, Enter to drop, Escape to cancel.`);return;}
   if(lifted.id===id){persist(layout);setLifted(null);setMessage(`Dropped. ${describe(layout,id)}`);}
   return;
  }
  if(event.key==='Escape'&&lifted?.id===id){event.preventDefault();snapshot();setLayout(lifted.original);setLifted(null);setMessage(`Move cancelled. ${describe(lifted.original,id)}`);focusGrip(id);return;}
  if(lifted?.id===id&&(event.key==='ArrowUp'||event.key==='ArrowDown'||event.key==='ArrowLeft'||event.key==='ArrowRight')){
   event.preventDefault();const next=stepCard(layout,id,event.key,count);
   if(sameLayout(next,layout)){setMessage(`${titleOf(id)} can’t move further that way.`);return;}
   snapshot();setLayout(next);setMessage(describe(next,id));focusGrip(id);
  }
 }
 const customized=!sameLayout(layout,defaultLayout(ids));
 const dragging=drag?.active?drag:null;
 return <section className="home-widget-board" aria-label="Dashboard cards" aria-describedby="home-widgets-help">
  <span role="status" className="sr-only">{message}</span>
  <p id="home-widgets-help" className="sr-only">Each card has a move handle. Press Space to pick a card up, the arrow keys to move it, Enter to drop it, or Escape to cancel.</p>
  <div ref={board} className="home-widget-columns" data-columns={count} data-audience={audience}>
   {columns.map((column,columnIndex)=><div className="home-widget-column" data-board-column={columnIndex} key={columnIndex}>
    {column.map(id=>{
     const widget=widgets.find(item=>item.id===id);if(!widget)return null;
     const isDragged=dragging?.id===id;
     return [isDragged?<div key={`${id}:slot`} className="home-widget-placeholder" style={{height:dragging.height}} aria-hidden="true"/>:null,
      <div className="home-widget" key={id} data-widget={id} data-dragging={isDragged||undefined} data-lifted={lifted?.id===id||undefined}
       style={isDragged?{position:'fixed',left:dragging.x-dragging.offsetX,top:dragging.y-dragging.offsetY,width:dragging.width,zIndex:40,pointerEvents:'none'}:undefined}
       onPointerDown={event=>start(event,id)}>
       <button type="button" className="home-widget-grip" aria-label={`Move ${titleOf(id)}`} aria-pressed={lifted?.id===id} aria-describedby="home-widgets-help"
        title="Drag to rearrange, or press Space and use the arrow keys" onKeyDown={event=>key(event,id)}><Grip/></button>
       {widget.node}
      </div>];
    })}
   </div>)}
  </div>
  {customized?<div className="home-widget-foot"><button type="button" className="text-link" onClick={()=>{snapshot();persist(defaultLayout(ids));setMessage('Default dashboard layout restored.');}}>Reset dashboard layout</button></div>:null}
 </section>;
}
