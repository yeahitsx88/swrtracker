"use client";
import type {AttachmentRecord} from '@/lib/contracts';
import {AdministrationRecords,AdministrationSection} from '@/components/ui/administration-records';
export function AttachmentList({attachments}:{attachments:AttachmentRecord[]}){
 if(!attachments.length)return <p className="muted">No attachments uploaded.</p>;
 return <AdministrationSection title="Attachment Records" open><AdministrationRecords label="attachments" rows={attachments} id={a=>a.id} columns={[
 {key:'filename',label:'File',text:a=>a.filename},
 {key:'purpose',label:'Purpose',text:a=>a.purpose==='REQUEST_INSTRUCTION'?'Request instruction':'Field support / evidence'},
 {key:'type',label:'Type',text:a=>a.mimeType},
 {key:'size',label:'Bytes',text:a=>String(a.sizeBytes)},
 {key:'cycle',label:'Revision cycle',text:a=>String(a.returnCycle)},
 {key:'uploaded',label:'Uploaded',text:a=>a.createdAt,render:a=>new Date(a.createdAt).toLocaleString()},
 {key:'hash',label:'SHA-256',text:a=>a.contentSha256,render:a=><details><summary>Checksum</summary>{a.contentSha256}</details>}
 ]} actions={a=><a className="app-link" href={a.downloadUrl}>Download</a>}/></AdministrationSection>;
}
