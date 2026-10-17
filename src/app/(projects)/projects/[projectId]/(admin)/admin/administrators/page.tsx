import {redirect} from 'next/navigation';
export default async function LegacyHelpDeskPage({params}:{params:Promise<{projectId:string}>}){const {projectId}=await params;redirect(`/projects/${projectId}/help-desk`);}
