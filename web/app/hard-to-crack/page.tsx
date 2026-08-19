import { db } from '@/lib/supabase';
import { Nav } from '../nav';
import { updateHtc } from '../actions';
import { ModeToggle } from './mode';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Companies Telescope is prioritising and has not broken into.
 *
 * Membership, status and last-email come from Affinity. The one-liner and the
 * step taken this week are Calvin's, edited in place, and a re-sync leaves them
 * alone.
 *
 * cadence_mode is the important distinction: a company being emailed by hand
 * looks abandoned to the outreach engine, and a company parked for an intro
 * later looks overdue. Neither is true, so both are stated.
 */
type Row = {
  id: number; company: string; domain: string | null; one_liner: string | null;
  tp_status: string | null; tp_owner: string | null; owner_initials: string | null;
  last_email_at: string | null; step_this_week: string | null; next_step: string | null;
  investors: string | null; city: string | null; conferences: string | null;
  sheet_note: string | null; cadence_mode: string; hold_reason: string | null;
  days_since_email: number | null; sequence_status: string | null;
  sequence_round: number | null; last_reply_at: string | null; needs_action: boolean;
};

export default async function HardToCrack() {
  const s = db();
  const { data } = await s.from('v_os_hard_to_crack').select('*');
  const rows = (data ?? []) as Row[];

  const mine = rows.filter((r) => (r.owner_initials ?? r.tp_owner ?? '').match(/CK|Calvin/));
  const needs = rows.filter((r) => r.needs_action)
    .sort((a, b) => (b.days_since_email ?? 9999) - (a.days_since_email ?? 9999));
  const held = rows.filter((r) => r.cadence_mode === 'hold');
  const running = rows.filter((r) => !r.needs_action && r.cadence_mode !== 'hold');

  return (
    <div className="wrap">
      <Nav current="/hard-to-crack" />

      <div className="kpis">
        <div className="kpi"><div className="k">On the list</div><div className="v">{rows.length}</div>
          <div className="s">Discovery drops off</div></div>
        <div className="kpi"><div className="k">Yours</div><div className="v">{mine.length}</div>
          <div className="s">CK on the sheet</div></div>
        <div className={`kpi ${needs.length ? 'warn' : 'ok'}`}><div className="k">Needs a step</div>
          <div className="v">{needs.length}</div><div className="s">quiet over 21 days</div></div>
        <div className="kpi"><div className="k">Holding</div><div className="v">{held.length}</div>
          <div className="s">intro coming later</div></div>
        <div className="kpi"><div className="k">Manual</div>
          <div className="v">{rows.filter((r) => r.cadence_mode === 'manual').length}</div>
          <div className="s">you email these by hand</div></div>
      </div>

      <Block
        title="Needs a step this week" rows={needs} tone="warn"
        note="Quiet more than three weeks, and not deliberately parked. Longest silence first."
      />
      <Block
        title="In motion" rows={running}
        note="Either a sequence is running or you are working it by hand."
      />
      <Block
        title="Holding for an intro" rows={held} muted
        note="Parked on purpose. These never count as behind."
      />

      <footer>
        Affinity supplies membership, status and last email. The one-liner and this
        week&apos;s step are yours, edited here, and survive
        a <span className="mono">os_htc_sync.js</span> re-sync.
      </footer>
    </div>
  );
}

function Block({
  title, rows, note, tone, muted,
}: {
  title: string; rows: Row[]; note?: string; tone?: string; muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2>{title} <span className="count">{rows.length}</span></h2>
      {note && <p className="note">{note}</p>}
      <div className={`panel${muted ? ' is-muted' : ''}`}>
        <table className="htc">
          <thead>
            <tr>
              <th>Company</th><th>One-liner</th><th>Step this week</th>
              <th>Quiet</th><th>Mode</th><th>City</th><th>Investors</th><th>Conferences</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const q = r.days_since_email;
              const bad = tone === 'warn' && (q === null || q > 60);
              return (
                <tr key={r.id} className={bad ? 'stop' : ''}>
                  <td className="co">
                    {r.domain
                      ? <a href={`https://${r.domain}`} target="_blank" rel="noopener noreferrer">
                          {r.company}
                        </a>
                      : r.company}
                    <span className="sub">
                      {r.owner_initials ?? '—'}
                      {r.tp_status ? ` · ${r.tp_status}` : ''}
                    </span>
                  </td>
                  <td className="edit">
                    <form action={updateHtc}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="field" value="one_liner" />
                      <input name="value" defaultValue={r.one_liner ?? ''}
                             placeholder="what they do" aria-label="One-liner" />
                    </form>
                  </td>
                  <td className="edit wide">
                    <form action={updateHtc}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="field" value="step_this_week" />
                      <input name="value" defaultValue={r.step_this_week ?? ''}
                             placeholder="what you did" aria-label="Step this week" />
                    </form>
                    {r.hold_reason && <span className="sub">{r.hold_reason}</span>}
                    {!r.hold_reason && r.next_step && <span className="sub">{r.next_step}</span>}
                  </td>
                  <td className="mono">
                    {q === null ? 'never' : `${q}d`}
                    {r.last_reply_at && <span className="pill ok">replied</span>}
                  </td>
                  <td className="mono dim">
                    <ModeToggle id={r.id} mode={r.cadence_mode} />
                    {r.cadence_mode === 'auto' && r.sequence_status === 'active' && (
                      <span className="sub">R{r.sequence_round} live</span>
                    )}
                  </td>
                  <td className="mono dim">{r.city ?? '—'}</td>
                  <td className="inv">{r.investors ?? '—'}</td>
                  <td className="conf">{r.conferences ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
