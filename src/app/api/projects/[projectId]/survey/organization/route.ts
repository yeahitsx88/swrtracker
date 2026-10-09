import { observeProjectRoute } from '@/lib/observe-project-route';
import { handleGetSurveyOrganization } from './handler';

export const dynamic = 'force-dynamic';
export const GET = observeProjectRoute(handleGetSurveyOrganization);
