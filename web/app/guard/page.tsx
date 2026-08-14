import { db } from '@/lib/supabase';
import { Nav } from '../nav';

export const dynamic = 'force-dynamic';

type Hit = {
  signal: string; verdict: 'blocked' | 'warn' | 'note';
  company: string; known_as: string; detail: string;
  last_touch: string | null; days_ago: number | null;
};

export default async function Guard({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; founder?: string; email?: string }>;
}) {
  const q = await searchParams;
  const domain = (q.domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  let hits: Hit[] = [];
  if (domain) {
    const { data } = await db().rpc('guard_check', {
      p_domain: domain,
      p_founder: q.founder?.trim() || null,
      p_email: q.email?.trim().toLowerCase() || null,
    });
    hits = (data ?? []) as Hit[];
  }

  const worst: 'blocked' | 'warn' | 'clear' =
    hits.some((h) => h.verdict === 'blocked') ? 'blocked'
    : hits.length ? 'warn' : 'clear';

  const headline = {
    blocked: 'Do not send',
    warn: 'Check before sending',
    clear: 'No match on record',
  }[worst];

  return (
    <div className="wrap">
      <Nav current="/guard" />

      <section>
        <h2>Before you send</h2>
        <p className="note">
          Give the founder&apos;s name and address as well as the domain. Domain alone is not
          enough: when Meridian became Verra, the CRM record moved to the new domain while every
          email stayed logged under the old one, so a domain check came back clean on a founder
          who had been emailed three times seven weeks earlier.
        </p>
        <div className="panel">
          <form className="guard" method="get">
            <label>Domain
              <input type="text" name="domain" placeholder="acme.com" defaultValue={q.domain ?? ''} required />
            </label>
            <label>Founder name
              <input type="text" name="founder" placeholder="Jane Doe" defaultValue={q.founder ?? ''} />
            </label>
            <label>Founder email
              <input type="email" name="email" placeholder="jane@acme.com" defaultValue={q.email ?? ''} />
            </label>
            <button type="submit">Check</button>
          </form>
        </div>
      </section>

      {domain && (
        <section>
          <h2>Verdict <span className="count">{domain}</span></h2>
          <div className="panel">
            <div className={`verdict ${worst}`}>
              <div className="row">
                <span className="big">{headline}</span>
                <span className="mono dim">
                  {hits.length} signal{hits.length === 1 ? '' : 's'}
                </span>
              </div>
              {worst === 'clear' && (
                <span className="mono dim">
                  Nothing in the database matches this domain, this founder, or this mailbox.
                  Affinity is a separate check and still worth running.
                </span>
              )}
            </div>
            {hits.length > 0 && (
              <table>
                <thead>
                  <tr><th>Verdict</th><th>Matched on</th><th>Company</th>
                    <th>Known as</th><th>Last touch</th><th>Detail</th></tr>
                </thead>
                <tbody>
                  {hits.map((h, i) => (
                    <tr key={i} className={h.verdict === 'blocked' ? 'stop' : h.verdict === 'warn' ? 'warn' : ''}>
                      <td>
                        <span className={`pill ${h.verdict === 'blocked' ? 'stop' : h.verdict === 'warn' ? 'r2' : ''}`}>
                          {h.verdict}
                        </span>
                      </td>
                      <td className="mono">{h.signal}</td>
                      <td className="co">{h.company}</td>
                      <td className="mono dim">{h.known_as}</td>
                      <td className="mono">
                        {h.last_touch ? `${h.last_touch} (${h.days_ago}d)` : 'never emailed'}
                      </td>
                      <td className="mono dim">{h.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      <footer>
        Blocked means a reply on record, or contact inside 90 days. Warn means older contact.
        The call is still yours.
      </footer>
    </div>
  );
}
