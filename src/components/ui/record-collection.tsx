'use client';
import {Children,Fragment,isValidElement,type ReactNode,type ReactElement} from 'react';
import {AdministrationRecords} from './administration-records';

/** Preserve existing role-specific editors/actions while giving each record a semantic row.
 * The children are already scoped by the parent/API. This component never fetches records or grants actions.
 */
function content(node:ReactNode):ReactNode[] {
 return Children.toArray(node).flatMap(child=>isValidElement<{children?:ReactNode}>(child)&&child.type===Fragment?content(child.props.children):[child]);
}
export function recordText(node:ReactNode):string {
 if(typeof node==='string'||typeof node==='number')return String(node);
 if(Array.isArray(node))return node.map(recordText).join(' ');
 if(isValidElement<{children?:ReactNode;ticket?:{ticketNumber?:string;description?:string;status?:string}}>(node))return node.props.ticket?[node.props.ticket.ticketNumber,node.props.ticket.description,node.props.ticket.status].filter(Boolean).join(' '):recordText(node.props.children);
 return '';
}
export function RecordCollection({label,records,headings=['Record','Details','Actions']}:{label:string;records:ReactNode;headings?:string[]}){
 const rows=content(records).filter(isValidElement).map((element,index)=>{
  const row=element as ReactElement<{children?:ReactNode}>;
  const parts=(typeof row.type!=='string'||row.type==='details'?[row]:content(row.props.children)).filter(part=>typeof part!=='string'||part.trim().length>0);
  // Inline prose is one record field, not a column for every punctuation node.
  const cells=parts.some(part=>typeof part==='string'||typeof part==='number')?[<span key="record">{row.props.children}</span>]:parts;
  return {id:String(row.key??index),cells};
 });
 const width=Math.max(1,...rows.map(row=>row.cells.length));
 return <div className="stack"><p className="muted">Filtering and selection apply to the records loaded in this view.</p><AdministrationRecords<{id:string;cells:ReactNode[]}> label={label} rows={rows} id={row=>row.id} columns={Array.from({length:width},(_,index)=>({key:String(index),label:headings[index]??`Details ${index}`,text:row=>recordText(row.cells[index]),render:row=>row.cells[index]??'—'}))}/></div>;
}
