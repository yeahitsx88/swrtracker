import { notFound } from 'next/navigation';
import { SurveyTeamPrototype } from './survey-team-prototype';

export const dynamic = 'force-dynamic';

export default function SurveyTeamPrototypePage() {
  // Disposable fixture surface. Never enabled in a production runtime.
  if (process.env.NODE_ENV !== 'development') notFound();
  return <SurveyTeamPrototype />;
}
