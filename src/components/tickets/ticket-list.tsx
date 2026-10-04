"use client";
import Link from 'next/link';
import type {ReactNode} from 'react';
import type {TicketRecord} from '@/lib/contracts';
import type {AreaName} from '@/lib/use-area-names';
import {AdministrationRecords} from '@/components/ui/administration-records';
import {ticketTypeLabel,priorityLabel} from '@/lib/display-labels';
import {formatCalendarDate} from '@/lib/calendar-date';
import {StatusBadge} from '@/components/ui';
interface TicketListProps {projectId:string;tickets:TicketRecord[];areaNames?:Map<string,AreaName>;renderActions?:(ticket:TicketRecord)=>ReactNode;emptyTitle?:string;emptyMessage?:string;}
export function TicketList({projectId,tickets,areaNames,renderActions,emptyTitle='No requests yet',emptyMessage='Requests you can see will appear here.'}:TicketListProps){

 return <div className="stack">{!tickets.length?<div className="empty-state" role="status"><strong>{emptyTitle}</strong><span>{emptyMessage}</span></div>:null}<AdministrationRecords label="requests" description="Filter, sort and export requests on this loaded page. Use this view’s search or page controls to review remaining authorized history." rows={tickets} id={t=>t.id} columns={[
 {key:'number',label:'Number',text:t=>t.ticketNumber??'Draft',render:t=><Link className="app-link" href={`/projects/${projectId}/tickets/${t.id}`}>{t.ticketNumber??'Open draft'}</Link>},
 {key:'description',label:'Request',className:'request-description-column',text:t=>t.description||'Untitled draft'},
 {key:'type',label:'Type',className:'request-type-column',text:t=>t.ticketType?ticketTypeLabel(t.ticketType):'Not specified'},
 {key:'area',label:'Area',text:t=>t.aorNodeId?areaNames?.get(t.aorNodeId)?.path??t.aorNodeId:'Not specified'},
 {key:'date',label:'Need-By',text:t=>t.requestedDate??'',render:t=>t.requestedDate?formatCalendarDate(t.requestedDate):'Not specified'},
 {key:'status',label:'Status',text:t=>t.status.replaceAll('_',' '),render:t=><StatusBadge status={t.status} viewerIsRequester={false}/>},
 {key:'priority',label:'Priority',text:t=>priorityLabel(t.priority)}
 ]} actions={renderActions}/></div>;
}
