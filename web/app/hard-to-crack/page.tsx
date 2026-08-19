import { db } from '@/lib/supabase';
import { Nav } from '../nav';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Companies Telescope is prioritising and has not broken into.
 *
 * Membership and status come from the Affinity saved view; the columns mirror
 * the sheet tab Calvin already reads. The column that actually matters is not
 * status, it is how long since anyone emailed them, because "hard to crack"
 * decays into "forgotten" quietly.
 */
const STALE = 21;

type Row = {
  id: number; company: string; domain: string | null; one_liner: string | null;
  tp_status: string | null; list_status: string | null; tp_owner: string | null;
  score: number | null; last_email_at: string | null; last_email_subject: string | null;
  last_email_to: string | null; next_step: string | null; note: string | null;
  days_since_email: number | null; sequence_status: string | null; sequence_round: number | null;
  last_reply_at: string | null;
};

export default async function HardToCrack() {
  const s = db();
  const { data } = await s.from('v_os_hard_to_crack').select('*');
  const rows = (data ?? []) as Row[];

  const mine = rows.filter((r) => (r.tp_owner ?? '').includes('Calvin'));
  const stale = rows.filter((r) => r.days_since_email === null || r.days_since_email > STALE);
  const replied = rows.filter((r) => r.last_reply_at);
  const live = rows.filter((r) => r.sequence_status === 'active');

  // Quiet longest first. A company nobody has emailed sorts to the very top.
  const ordered = rows.slice().sort((a, b) =>
    (b.days_since_email ?? 9999) - (a.days_since_email ?? 9999));

  const owners = ['Calvin', 'Chris', 'Both', 'Unassigned'];
  const ownerOf = (r: Row) => {
    const o = r.tp_owner ?? '';
    if (o.includes('Calvin') && o.includes('Chris')) return 'Both';
    if (o.includes('Calvin')) return 'Calvin';
    if (o.includes('Chris')) return 'Chris';
    return 'Unassigned';
  };

  return (
    <div className="wrap">
      <Nav current="/hard-to-crack" />

      <div className="kpis">
        <div className="kpi"><div className="k">On the list</div><div className="v">{rows.length}</div>
          <div className="s">from Affinity</div></div>
        <div className="kpi"><div className="k">Yours</div><div className="v">{mine.length}</div>
          <div className="s">TPOwner includes Calvin</div></div>
        <div className={`kpi ${stale.length ? 'warn' : 'ok'}`}><div className="k">Gone quiet</div>
          <div className="v">{stale.length}</div>
          <div className="s">over {STALE} days, or never</div></div>
        <div className="kpi ok"><div className="k">Ever replied</div><div className="v">{replied.length}</div>
          <div className="s">someone wrote back</div></div>
        <div className="kpi"><div className="k">Cadence live</div><div className="v">{live.length}</div>
          <div className="s">sequence running now</div></div>
      </div>

      <p className="note">
        Ordered by silence, longest first, because a company on this list decays into a forgotten
        one without anything changing status. Reply history and cadence state are joined from the
        outreach database on domain, so a company with a live sequence is marked rather than
        chased twice.
      </p>

      {owners.map((o) => {
        const list = ordered.filter((r) => ownerOf(r) === o);
        if (list.length === 0) return null;
        return (
          <section key={o}>
            <h2>{o === 'Unassigned' ? 'No owner' : o} <span className="count">{list.length}</span></h2>
            <div className="panel">
              <table>
                <thead>
                  <tr>
                    <th>Company</th><th>Website</th><th>One-liner</th>
                    <th>TP status</th><th>Last email</th><th>Quiet</th><th>Cadence</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const quiet = r.days_since_email;
                    const bad = quiet === null || quiet > 60;
                    const warn = quiet !== null && quiet > STALE && quiet <= 60;
                    return (
                      <tr key={r.id} className={bad ? 'stop' : warn ? 'warn' : ''}>
                        <td className="co">{r.company}</td>
                        <td className="mono dim">
                          {r.domain
                            ? <a href={`https://${r.domain}`} target="_blank" rel="noopener noreferrer">
                                {r.domain}
                              </a>
                            : '—'}
                        </td>
                        <td className={r.one_liner ? '' : 'mono dim'}>
                          {r.one_liner ?? 'needs a one-liner'}
                        </td>
                        <td className="mono dim">{r.tp_status ?? '—'}</td>
                        <td className="mono dim">{r.last_email_at ?? 'never'}</td>
                        <td className="mono">
                          {quiet === null ? 'never' : `${quiet}d`}
                        </td>
                        <td className="mono dim">
                          {r.last_reply_at
                            ? <span className="pill ok">replied</span>
                            : r.sequence_status === 'active'
                              ? <span className="pill r2">R{r.sequence_round} live</span>
                              : r.sequence_status
                                ? r.sequence_status
                                : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <footer>
        Synced with <span className="mono">node scripts/os_htc_sync.js &lt;affinity.json&gt; --apply</span>.
        One-liners and next steps are written here and survive a re-sync.
      </footer>
    </div>
  );
}
