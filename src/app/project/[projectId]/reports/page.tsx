import { notFound } from 'next/navigation';
import { ProjectReports } from './project-reports';

export default async function ReportsPage({params}:{params:Promise<{projectId:string}>}) {
  const {projectId}=await params;
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(projectId))notFound();
  return <ProjectReports projectId={projectId}/>;
}
