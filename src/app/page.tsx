import Link from 'next/link';
import { Shell } from './ui/shell';

export default function Home() {
  return <Shell><p className="eyebrow">Field operations</p>
    <h1>Survey support,<br />from request to field.</h1>
    <p className="muted">Use your project’s request link to start a survey request, or pick up a draft you have already saved.</p>
    <div className="actions"><Link className="button" href="/drafts">Open my drafts</Link>
      <Link className="button secondary" href="/login">Sign in</Link></div>
    <section className="panel"><h2>Planning your request</h2><p>Have the work location, request type, and needed date ready. Standard requests require at least 48 hours’ notice.</p>
      <p className="muted">You can save an unfinished request and return to it later. Ask your project administrator for your project’s request link.</p></section>
  </Shell>;
}
