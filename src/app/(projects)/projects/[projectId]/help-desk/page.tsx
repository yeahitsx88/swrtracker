import {HelpDesk} from '@/components/ui/help-desk';
export default async function ProjectHelpDeskPage({params}:{params:Promise<{projectId:string}>}){const {projectId}=await params;return <HelpDesk projectId={projectId}/>;}
