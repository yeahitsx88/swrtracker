'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Button,Input} from '@/components/ui';
import './administration-records.css';
import {HeadingHelp,HelpHint} from './heading-help';
import {headingCase} from '@/lib/heading-case';

export function AdministrationSection({title,description,children,open=false,locked=false,level=3}:{title:string;description?:ReactNode;children:ReactNode;open?:boolean;locked?:boolean;level?:2|3}){
 const [expanded,setExpanded]=useState(open);
 const Heading=level===2?'h2':'h3';
 const heading=<Heading className="panel-title"><button type="button" className="administration-disclosure" aria-expanded={expanded} disabled={locked} onClick={()=>setExpanded(v=>!v)}>{headingCase(title)}<span aria-hidden="true">{expanded?'−':'+'}</span></button></Heading>;
 return <section className="administration-section">{description?<HeadingHelp label={headingCase(title)} heading={heading} help={description}/>:heading}<div hidden={!expanded} className="stack administration-section-content">{children}</div></section>;
}
export interface RecordColumn<T>{key:string;label:string;className?:string;text:(row:T)=>string;render?:(row:T)=>ReactNode}
export function AdministrationRecords<T>({label,description,rows,id,columns,actions,selectionActions,preferencesKey,selected:externalSelected,onSelection:externalSelection,compact=false,scrollable=false,preserveOrder=false,disabled=false,eligible=()=>true}:{label:string;description?:ReactNode;preferencesKey?:string;rows:T[];compact?:boolean;scrollable?:boolean;preserveOrder?:boolean;id:(row:T)=>string;columns:RecordColumn<T>[];actions?:(row:T)=>ReactNode;selectionActions?:ReactNode;selected?:string[];onSelection?:(ids:string[])=>void;disabled?:boolean;eligible?:(row:T)=>boolean}){
 const [hiddenColumns,setHiddenColumns]=useState<string[]>([]),[widths,setWidths]=useState<Record<string,number>>({});
 const [loadedKey,setLoadedKey]=useState<string>();
 const columnKeys=columns.map(column=>column.key).join('|');
 useEffect(()=>{
  setHiddenColumns([]);setWidths({});setLoadedKey(undefined);
  if(!preferencesKey)return;
  try{
   const saved=JSON.parse(localStorage.getItem(`swr:columns:${preferencesKey}`)??'null');
   const keys=columnKeys.split('|');
   if(saved){
    setHiddenColumns(Array.isArray(saved.hidden)?saved.hidden.filter((key:unknown)=>typeof key==='string'&&keys.includes(key)&&key!==keys[0]):[]);
    setWidths(Object.fromEntries(Object.entries(saved.widths??{}).filter(([key,value])=>keys.includes(key)&&typeof value==='number'&&Number.isFinite(value)).map(([key,value])=>[key,Math.min(600,Math.max(100,Number(value)))])));
   }
  }catch{/* Invalid or unavailable browser storage uses the defaults. */}
  setLoadedKey(preferencesKey);
 },[preferencesKey,columnKeys]);
 useEffect(()=>{
  if(!preferencesKey||loadedKey!==preferencesKey)return;
  try{localStorage.setItem(`swr:columns:${preferencesKey}`,JSON.stringify({hidden:hiddenColumns,widths}));}catch{/* The table remains usable without storage. */}
 },[preferencesKey,loadedKey,hiddenColumns,widths]);
 const displayedColumns=preferencesKey?columns.filter(column=>!hiddenColumns.includes(column.key)):columns;
 const columnWidth=(key:string)=>widths[key]??(key==='status'?230:key==='request'||key==='description'?260:160);
 const resize=(key:string,width:number)=>setWidths(current=>({...current,[key]:Math.max(100,Math.min(600,width))}));
 const [toolsOpen,setToolsOpen]=useState(false);
 const scrollRef=useRef<HTMLDivElement>(null);
 const [overflows,setOverflows]=useState(false);
 useEffect(()=>{
  if((!compact&&!scrollable)||!scrollRef.current)return;
  const node=scrollRef.current;
  const measure=()=>setOverflows(node.scrollWidth>node.clientWidth+1);
  const observer=new ResizeObserver(measure);
  observer.observe(node);if(node.firstElementChild)observer.observe(node.firstElementChild);
  measure();return()=>observer.disconnect();
 },[compact,scrollable,rows]);
 const [localSelected,setLocalSelected]=useState<string[]>([]);
 const selected=(externalSelected??localSelected).filter(value=>rows.some(row=>id(row)===value)),onSelection=externalSelection??setLocalSelected;
 function exportSelected(){const chosen=rows.filter(row=>selected.includes(id(row)));const cell=(value:string)=>'\"'+(/^[\s]*[=+@-]|^[\t\r]/.test(value)?"'":'')+value.replaceAll('\"','\"\"')+'\"';const csv=[displayedColumns.map(c=>cell(c.label)).join(','),...chosen.map(row=>displayedColumns.map(c=>cell(c.text(row))).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=label.replace(/[^a-z0-9-]/gi,'-')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const [filter,setFilter]=useState(''),[sort,setSort]=useState(preserveOrder?'':columns[0]?.key??''),[descending,setDescending]=useState(false),[page,setPage]=useState(0);
 const column=columns.find(c=>c.key===sort)??columns[0]!;
 const matching=rows.filter(row=>columns.some(c=>c.text(row).toLowerCase().includes(filter.toLowerCase())));
 if(sort)matching.sort((a,b)=>(descending?-1:1)*(column.text(a).localeCompare(column.text(b),undefined,{numeric:true,sensitivity:'base'})||id(a).localeCompare(id(b))));
 const current=Math.min(page,Math.max(0,Math.ceil(matching.length/25)-1)),visible=matching.slice(current*25,current*25+25),selectable=visible.filter(eligible).map(id),all=selectable.length>0&&selectable.every(value=>selected.includes(value));
 function toggle(value:string){onSelection?.(selected.includes(value)?selected.filter(v=>v!==value):[...selected,value]);}
 return <div className="stack">{compact&&<Button variant="secondary" aria-expanded={toolsOpen} onClick={()=>setToolsOpen(value=>!value)}>Filter and export</Button>}<div className="stack record-collection-tools" hidden={compact&&!toolsOpen}><label className="field"><span className="field-label">Filter {label}</span><Input value={filter} disabled={disabled} maxLength={100} onChange={e=>{setFilter(e.target.value);setPage(0);}}/></label>
 {<div className="row"><span role="status">{selected.length} selected</span><Button variant="secondary" disabled={disabled||!selected.length} onClick={()=>onSelection([])}>Clear selection</Button><Button variant="secondary" disabled={disabled||!matching.some(eligible)} onClick={()=>onSelection([...new Set([...selected,...matching.filter(eligible).map(id)])])}>Select all matching</Button><Button variant="secondary" disabled={disabled||!selected.length} onClick={exportSelected}>Export selected</Button>{selectionActions}</div>}</div>
 {preferencesKey&&<details className="record-column-options"><summary>Columns and widths</summary><p className="muted">Choose columns to show. Drag a column edge or use its width control. Settings are saved in this browser. Exports include visible columns.</p><div className="record-column-settings">{columns.map((c,index)=><div key={c.key}><label><input type="checkbox" checked={!hiddenColumns.includes(c.key)} disabled={disabled||index===0} onChange={event=>{setHiddenColumns(current=>event.target.checked?current.filter(key=>key!==c.key):[...current,c.key]);if(sort===c.key){setSort(columns[0]!.key);setDescending(false);}}}/>{c.label}</label><label>Width <input type="range" aria-label={`${c.label} column width`} min={100} max={600} step={10} value={columnWidth(c.key)} disabled={disabled||hiddenColumns.includes(c.key)} onChange={event=>resize(c.key,Number(event.target.value))}/><output>{columnWidth(c.key)} px</output></label></div>)}</div><Button variant="secondary" disabled={disabled} onClick={()=>{setHiddenColumns([]);setWidths({});}}>Reset columns</Button></details>}
 <div ref={scrollRef} className={`administration-table-scroll${scrollable?' record-scrollable':''}`} tabIndex={0} role="region" aria-label={`${label} table`}><table className={`administration-table${preferencesKey?' record-custom-columns':''}`} style={preferencesKey?{width:44+displayedColumns.reduce((sum,column)=>sum+columnWidth(column.key),0)+(actions?220:0)}:undefined}><caption className={compact?"administration-table-caption record-compact-caption":"administration-table-caption"}><span className="record-caption-heading">{headingCase(label)}{!compact&&(description||overflows)&&<HelpHint label={headingCase(label)}>{description}{overflows&&<p>Scroll the table sideways to see every column and action.</p>}</HelpHint>}</span></caption>{preferencesKey&&<colgroup><col style={{width:44}}/>{displayedColumns.map(c=><col key={c.key} style={{width:columnWidth(c.key)}}/>)}{actions&&<col style={{width:220}}/>}</colgroup>}<thead><tr>{<th scope="col"><input type="checkbox" aria-label={`Select this page of ${label}`} checked={all} disabled={disabled||!selectable.length} onChange={()=>onSelection(all?selected.filter(v=>!selectable.includes(v)):[...new Set([...selected,...selectable])])}/></th>}{displayedColumns.map(c=><th key={c.key} className={c.className} scope="col" aria-sort={sort===c.key?descending?'descending':'ascending':'none'}><button type="button" disabled={disabled} onClick={()=>{setDescending(sort===c.key?!descending:false);setSort(c.key);setPage(0);}}>{headingCase(c.label)}{sort===c.key?<span aria-hidden="true"> {descending?'↓':'↑'}</span>:null}</button>{preferencesKey&&<span className="record-column-resize" role="separator" aria-label={`Resize ${c.label} column`} aria-orientation="vertical" aria-valuemin={100} aria-valuemax={600} aria-valuenow={columnWidth(c.key)} tabIndex={disabled?-1:0} onKeyDown={event=>{if(disabled)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();resize(c.key,columnWidth(c.key)+(event.key==='ArrowRight'?10:-10));}}} onPointerDown={event=>{if(disabled)return;event.preventDefault();const node=event.currentTarget,start=event.clientX,width=columnWidth(c.key);node.setPointerCapture(event.pointerId);node.onpointermove=move=>resize(c.key,width+move.clientX-start);node.onpointerup=()=>{node.onpointermove=null;node.onpointerup=null;};node.onlostpointercapture=()=>{node.onpointermove=null;};}}/>}</th>)}{actions&&<th scope="col">Actions</th>}</tr></thead><tbody>{visible.map(row=><tr key={id(row)}>{<td><input type="checkbox" aria-label={`Select ${columns[0]!.text(row)}`} checked={selected.includes(id(row))} disabled={disabled||!eligible(row)} onChange={()=>toggle(id(row))}/></td>}{displayedColumns.map(c=><td key={c.key} className={c.className} title={preferencesKey?c.text(row):undefined}>{preferencesKey?<div className="record-cell-content">{c.render?c.render(row):c.text(row)}</div>:c.render?c.render(row):c.text(row)}</td>)}{actions&&<td><div className="row">{actions(row)}</div></td>}</tr>)}</tbody></table></div>
 {!matching.length&&<p>No matching {label}.</p>}{(!compact||matching.length>25)&&<div className="row"><Button variant="secondary" disabled={disabled||current===0} onClick={()=>setPage(current-1)}>Previous {label}</Button><span role="status">{matching.length?current*25+1:0}–{Math.min((current+1)*25,matching.length)} of {matching.length}</span><Button variant="secondary" disabled={disabled||(current+1)*25>=matching.length} onClick={()=>setPage(current+1)}>Next {label}</Button></div>}</div>;
}
