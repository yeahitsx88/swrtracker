'use client';
import {useState,type ReactNode} from 'react';
import {Button,Input} from '@/components/ui';
import './administration-records.css';

export function AdministrationSection({title,children,open=false,locked=false}:{title:string;children:ReactNode;open?:boolean;locked?:boolean}){
 const [expanded,setExpanded]=useState(open);
 return <section className="administration-section"><h3 className="panel-title"><button type="button" className="administration-disclosure" aria-expanded={expanded} disabled={locked} onClick={()=>setExpanded(v=>!v)}>{title}<span aria-hidden="true">{expanded?'−':'+'}</span></button></h3><div hidden={!expanded} className="stack administration-section-content">{children}</div></section>;
}
export interface RecordColumn<T>{key:string;label:string;text:(row:T)=>string;render?:(row:T)=>ReactNode}
export function AdministrationRecords<T>({label,rows,id,columns,actions,selected=[],onSelection,disabled=false,eligible=()=>true}:{label:string;rows:T[];id:(row:T)=>string;columns:RecordColumn<T>[];actions?:(row:T)=>ReactNode;selected?:string[];onSelection?:(ids:string[])=>void;disabled?:boolean;eligible?:(row:T)=>boolean}){
 const [filter,setFilter]=useState(''),[sort,setSort]=useState(columns[0]?.key??''),[descending,setDescending]=useState(false),[page,setPage]=useState(0);
 const column=columns.find(c=>c.key===sort)??columns[0]!;
 const matching=rows.filter(row=>columns.some(c=>c.text(row).toLowerCase().includes(filter.toLowerCase()))).sort((a,b)=>(descending?-1:1)*(column.text(a).localeCompare(column.text(b),undefined,{numeric:true,sensitivity:'base'})||id(a).localeCompare(id(b))));
 const current=Math.min(page,Math.max(0,Math.ceil(matching.length/25)-1)),visible=matching.slice(current*25,current*25+25),selectable=visible.filter(eligible).map(id),all=selectable.length>0&&selectable.every(value=>selected.includes(value));
 function toggle(value:string){onSelection?.(selected.includes(value)?selected.filter(v=>v!==value):[...selected,value]);}
 return <div className="stack"><label className="field"><span className="field-label">Filter {label}</span><Input value={filter} disabled={disabled} maxLength={100} onChange={e=>{setFilter(e.target.value);setPage(0);}}/></label>
 {onSelection&&<div className="row"><span role="status">{selected.length} selected</span><Button variant="secondary" disabled={disabled||!selected.length} onClick={()=>onSelection([])}>Clear selection</Button></div>}
 <div className="administration-table-scroll" tabIndex={0} role="region" aria-label={`${label} table`}><table className="administration-table"><caption className="sr-only">{label}</caption><thead><tr>{onSelection&&<th scope="col"><input type="checkbox" aria-label={`Select this page of ${label}`} checked={all} disabled={disabled||!selectable.length} onChange={()=>onSelection(all?selected.filter(v=>!selectable.includes(v)):[...new Set([...selected,...selectable])])}/></th>}{columns.map(c=><th key={c.key} scope="col" aria-sort={sort===c.key?descending?'descending':'ascending':'none'}><button type="button" disabled={disabled} onClick={()=>{setDescending(sort===c.key?!descending:false);setSort(c.key);setPage(0);}}>{c.label}{sort===c.key?<span aria-hidden="true"> {descending?'↓':'↑'}</span>:null}</button></th>)}{actions&&<th scope="col">Actions</th>}</tr></thead><tbody>{visible.map(row=><tr key={id(row)}>{onSelection&&<td><input type="checkbox" aria-label={`Select ${columns[0]!.text(row)}`} checked={selected.includes(id(row))} disabled={disabled||!eligible(row)} onChange={()=>toggle(id(row))}/></td>}{columns.map(c=><td key={c.key}>{c.render?c.render(row):c.text(row)}</td>)}{actions&&<td><div className="row">{actions(row)}</div></td>}</tr>)}</tbody></table></div>
 {!matching.length&&<p>No matching {label}.</p>}<div className="row"><Button variant="secondary" disabled={disabled||current===0} onClick={()=>setPage(current-1)}>Previous {label}</Button><span role="status">{matching.length?current*25+1:0}–{Math.min((current+1)*25,matching.length)} of {matching.length}</span><Button variant="secondary" disabled={disabled||(current+1)*25>=matching.length} onClick={()=>setPage(current+1)}>Next {label}</Button></div></div>;
}
