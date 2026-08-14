import { db } from '@/lib/supabase';
import { Nav } from '../nav';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TODAY = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

type Due = {
  company: string; founder: string | null; email: string;
  kind: string; step_no: number; due_date: string;
};

export default async function Analytics() {
  const s = db();
  const today = TODAY();

  const [trust, steps, latency, hours, weekly, outcomes, due, upcoming, restart, roster] =
    await Promise.all([
      s.from('an_trust').select('*').single(),
      s.from('an_step_performance').select('*').order('step_no'),
      s.from('an_reply_latency').select('*').order('ord'),
      s.from('an_send_hour').select('*').order('hour_pt'),
      s.from('an_net_new_weekly').select('*').order('week', { ascending: false }).limit(6),
      s.from('an_outcome_funnel').select('*'),
      s.from('dash_due').select('*'),
      s.rpc('upcoming_load'),
      s.from('dash_ended_early').select('*'),
      s.from('an_sequence_reply').select('*').eq('status', 'active'),
    ]);

  const t = trust.data as Record<string, number | string> | null;
  const r1 = (steps.data ?? []).filter((x: any) => x.kind === 'first');
  const r2 = (steps.data ?? []).filter((x: any) => x.kind === 'restart');
  const dueRows = (due.data ?? []) as Due[];
  const overdue = dueRows.filter((d) => d.due_date < today);
  const load = (upcoming.data ?? []) as { d: string; first: number; restart: number }[];
  const peak = Math.max(1, ...load.map((l) => l.first + l.restart));

  const replied = (outcomes.data ?? []).find((o: any) => o.outcome === 'untagged')?.n ?? 0;
  const noReply = (outcomes.data ?? []).find((o: any) => o.outcome === 'no_reply')?.n ?? 0;
  const totalSeq = Number(replied) + Number(noReply);

  const trouble =
    Number(t?.drafted_never_sent ?? 0) + Number(t?.spacing_violations ?? 0) +
    Number(t?.incomplete_cadence ?? 0) + Number(t?.sent_without_timestamp ?? 0);

  const kpis = [
    { k: 'Due now', v: dueRows.length, sub: overdue.length ? `${overdue.length} overdue` : 'nothing late',
      tone: overdue.length ? 'stop' : dueRows.length ? 'warn' : 'ok' },
    { k: 'Active sequences', v: roster.data?.length ?? 0, sub: 'in cadence' },
    { k: 'Reply rate', v: totalSeq ? `${Math.round((Number(replied) / totalSeq) * 100)}%` : '—',
      sub: `${replied} of ${totalSeq}`, tone: 'ok' },
    { k: 'Net new this week', v: weekly.data?.[0]?.net_new ?? 0, sub: 'first contact from you' },
    { k: 'Restart candidates', v: restart.data?.length ?? 0, sub: 'cold, never restarted' },
    { k: 'Data issues', v: trouble, sub: trouble ? 'see trust panel' : 'database matches mailbox',
      tone: trouble ? 'warn' : 'ok' },
  ];

  return (
    <div className="wrap">
      <Nav current="/analytics" />

      <div className="kpis">
        {kpis.map((k) => (
          <div className={`kpi ${k.tone ?? ''}`} key={k.k}>
            <div className="k">{k.k}</div>
            <div className="v">{k.v}</div>
            <div className="s">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Trust first. Every number above is only as good as this one. */}
      <section>
        <h2>Does the database still match the mailbox?</h2>
        <p className="note">
          A step counts as sent only when the message left the mailbox. Last mail observed{' '}
          {t?.last_observed_mail ? String(t.last_observed_mail).slice(0, 10) : 'never'}.
        </p>
        <div className="panel">
          <table>
            <thead>
              <tr><th>Check</th><th>Count</th><th>What it means</th></tr>
            </thead>
            <tbody>
              {[
                ['Marked sent, no timestamp', t?.sent_without_timestamp, 'Sent state with no evidence behind it'],
                ['Drafted, never sent', t?.drafted_never_sent, 'A draft was made and nothing went out'],
                ['Overdue steps', t?.overdue, 'Past due and still unsent'],
                ['Incomplete cadences', t?.incomplete_cadence, 'Active sequence without all four steps'],
                ['Spacing violations', t?.spacing_violations, 'A later email lands on or before an earlier one'],
              ].map(([label, n, why]) => (
                <tr key={String(label)} className={Number(n) > 0 ? 'warn' : ''}>
                  <td className="co">{label as string}</td>
                  <td className="mono">{String(n ?? 0)}</td>
                  <td className="mono dim">{why as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Needs you today <span className="count">{dueRows.length}</span></h2>
        <div className="panel">
          {dueRows.length === 0 ? (
            <div className="empty">Nothing due. Every cadence is up to date.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Company</th><th>Founder</th><th>Email</th><th>Engine</th>
                  <th>Step</th><th>Due</th><th>Status</th></tr>
              </thead>
              <tbody>
                {dueRows.map((d, i) => {
                  const late = daysBetween(d.due_date, today);
                  return (
                    <tr key={i} className={late > 2 ? 'stop' : late > 0 ? 'warn' : ''}>
                      <td className="co">{d.company}</td>
                      <td className="mono dim">{d.founder}</td>
                      <td className="mono dim">{d.email}</td>
                      <td><span className={`pill ${d.kind === 'restart' ? 'r2' : 'r1'}`}>
                        {d.kind === 'restart' ? 'R2' : 'R1'}</span></td>
                      <td className="mono">Email {d.step_no}</td>
                      <td className="mono">{d.due_date}</td>
                      <td className="mono dim">{late > 0 ? `${late}d late` : 'today'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="two">
        <section>
          <h2>What each email earns</h2>
          <p className="note">
            Of founders still silent when that email went out. Not raw reply share, which
            credits Email 1 for the fact that replying early is why nothing else got sent.
          </p>
          <div className="panel">
            <div className="meters">
              {r1.map((x: any) => (
                <div className="meter" key={x.step_no}>
                  <span className="lbl">Email {x.step_no}</span>
                  <span className="track">
                    <span className="fill" style={{ width: `${Math.min(100, Number(x.pct) * 3)}%` }} />
                  </span>
                  <span className="val"><b>{x.pct}%</b> {x.replied_here}/{x.at_risk}</span>
                </div>
              ))}
              {r2.length > 0 && (
                <div className="meter" style={{ marginTop: 10 }}>
                  <span className="lbl">R2 overall</span>
                  <span className="track">
                    <span className="fill warn" style={{
                      width: `${Math.min(100, (r2.reduce((a: number, b: any) => a + Number(b.replied_here), 0) /
                        Math.max(1, Number(r2[0]?.at_risk ?? 1))) * 300)}%`,
                    }} />
                  </span>
                  <span className="val">
                    <b>{r2.reduce((a: number, b: any) => a + Number(b.replied_here), 0)}</b> replies
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section>
          <h2>How fast they answer</h2>
          <p className="note">Time from your first email to the founder&apos;s first reply.</p>
          <div className="panel">
            <div className="meters">
              {(latency.data ?? []).map((x: any) => {
                const max = Math.max(...(latency.data ?? []).map((y: any) => Number(y.n)));
                return (
                  <div className="meter" key={x.bucket}>
                    <span className="lbl">{x.bucket}</span>
                    <span className="track">
                      <span className="fill ok" style={{ width: `${(Number(x.n) / max) * 100}%` }} />
                    </span>
                    <span className="val"><b>{x.n}</b></span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section>
        <h2>Reply rate by send hour <span className="count">Pacific</span></h2>
        <p className="note">Only hours with at least eight sends. Thin bars are thin samples.</p>
        <div className="panel">
          <div className="chart">
            {(hours.data ?? []).filter((h: any) => Number(h.sent) >= 8).map((h: any) => (
              <div className="day" key={h.hour_pt}>
                <div className="bar">
                  <span className="seg r1" style={{ height: `${Number(h.pct)}%` }} />
                </div>
                <div className="n">{h.pct}%</div>
                <div className="dow">{h.hour_pt}:00</div>
                <div className="dt">n={h.sent}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2>Scheduled load, next 14 days
          <span className="count">{load.reduce((a, b) => a + b.first + b.restart, 0)} sends</span></h2>
        <div className="panel">
          <div className="chart">
            {load.map((l) => {
              const total = l.first + l.restart;
              const dow = new Date(l.d + 'T12:00:00Z')
                .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
              return (
                <div className={`day${/Sat|Sun/.test(dow) ? ' weekend' : ''}`} key={l.d}>
                  <div className="bar">
                    <span className="seg r2" style={{ height: `${(l.restart / peak) * 100}%` }} />
                    <span className="seg r1" style={{ height: `${(l.first / peak) * 100}%` }} />
                  </div>
                  <div className="n">{total}</div>
                  <div className="dow">{dow}</div>
                  <div className="dt">{l.d.slice(5)}</div>
                </div>
              );
            })}
          </div>
          <div className="legend">
            <span><i className="r1" />Round 1</span><span><i className="r2" />Round 2 restart</span>
          </div>
        </div>
      </section>

      <section>
        <h2>Net new by week</h2>
        <p className="note">
          Companies whose first email from you went out that week. Restarts excluded.
        </p>
        <div className="panel">
          <table>
            <thead><tr><th>Week of</th><th>Net new</th><th>Replied</th><th>Rate</th></tr></thead>
            <tbody>
              {(weekly.data ?? []).map((w: any) => (
                <tr key={w.week}>
                  <td className="mono">{String(w.week).slice(0, 10)}</td>
                  <td className="mono">{w.net_new}</td>
                  <td className="mono dim">{w.replied}</td>
                  <td className="mono">{w.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        Read-only. Sends, drafts and reconciliation still run from the scripts in this repo.
      </footer>
    </div>
  );
}
