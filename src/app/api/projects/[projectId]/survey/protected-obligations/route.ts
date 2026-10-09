import {observeProjectRoute} from '@/lib/observe-project-route';
import {handleGetProtectedObligations,handlePostProtectedObligations} from './handler';
export const dynamic='force-dynamic';



export const GET=observeProjectRoute(handleGetProtectedObligations);
export const POST=observeProjectRoute(handlePostProtectedObligations);
