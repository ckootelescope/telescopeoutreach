import { db } from '@/lib/supabase';
import { Nav } from '../nav';
import { setTargetStatus } from '../actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Two queues out of one table.
 *
 *   net new   people with no relationship yet. This is the point of the tab.
 *   catch up   an active relationship whose last touch has gone past its cadence.
 *
 * Anyone spoken to recently appears in neither, which is the correct answer for
 * a relationship that is already healthy. The count is shown so it is obvious
 * they were considered and excluded rather than missing.
 */
const BUCKET: Record<string, string> = {
  coinvest: 'Co-invest at A',
  upstream: 'Upstream, seed',
  downstream: 'Downstream, B+',
  corporate: 'Corporate',
};

type Row = {
  id: number; name: string; firm: string; title: string | null; linkedin: string | null;
  email: string | null; bucket: string; invests_in: string | null; why: string | null;
  message: string | null; status: string; verified: boolean; note: string | null;
  relationship: string | null; last_outreach: string | null; next_action: string | null;
  relevant_cos: string | null; tier: string | null; firm_type: string | null; tier_num: number | null;
  cadence: number | null;
  queue: string; days_since: number | null; due_in: number | null; cadence_days: number;
};

export default async function Investors() {
  const s = db();
  const [qRes, dRes] = await Promise.all([
    s.from('v_os_investor_queue').select('*').order('sort'),
    s.from('v_os_deal_share').select('*'),
  ]);
  const rows = (qRes.data ?? []) as Row[];
  const deals = (dRes.data ?? []) as any[];

  const netNew = rows.filter((r) => r.queue === 'net_new');
  const catchUp = rows.filter((r) => r.queue === 'catch_up')
    .sort((a, b) => (b.days_since ?? 0) - (a.days_since ?? 0));
  const current = rows.filter((r) => r.queue === 'current')
    .sort((a, b) => (a.due_in ?? 0) - (b.due_in ?? 0));
  const undated = rows.filter((r) => r.queue === 'undated');
  const parked = rows.filter((r) => r.queue === 'parked');

  const unver = rows.filter((r) => !r.verified).length;
  const sent = rows.filter((r) => r.status !== 'todo').length;

  return (
    <div className="wrap">
      <Nav current="/investors" />

      <div className="kpis">
        <div className="kpi"><div className="k">Net new</div><div className="v">{netNew.length}</div>
          <div className="s">never spoken to</div></div>
        <div className={`kpi ${catchUp.length ? 'warn' : 'ok'}`}><div className="k">Due a catch-up</div>
          <div className="v">{catchUp.length}</div>
          <div className="s">past their cadence</div></div>
        <div className="kpi ok"><div className="k">Current</div><div className="v">{current.length}</div>
          <div className="s">recently spoken, held back</div></div>
        <div className={`kpi ${undated.length ? 'warn' : ''}`}><div className="k">No date on record</div>
          <div className="v">{undated.length}</div>
          <div className="s">spoken to, when unknown</div></div>
      </div>

      <p className="note">
        Cadence comes from tier: 1 monthly, 2 quarterly, 3 every six months, 4 yearly, 5 parked.
        {current.length} relationships are inside cadence and held back, {parked.length} parked.
        {unver > 0 && ` ${unver} still need verifying.`}
        {sent > 0 && ` ${sent} marked done.`}
      </p>

      {/* Catch-up first: an existing relationship going cold costs more than a
          cold name you never had. */}
      {catchUp.length > 0 && (
        <section>
          <h2>Due a catch-up <span className="count">{catchUp.length}</span></h2>
          <p className="note">
            Already spoken to, and past cadence. Ordered by how long it has been.
          </p>
          <div className="tcards">
            {catchUp.map((t) => <Card key={t.id} t={t} mode="catch" />)}
          </div>
        </section>
      )}

      <section>
        <h2>Net new <span className="count">{netNew.length}</span></h2>
        <p className="note">
          No relationship on record. Junior investors first, but title does not matter at a Tier 1.
        </p>
        {(['coinvest', 'upstream', 'downstream', 'corporate'] as const).map((b) => {
          const list = netNew.filter((r) => r.bucket === b);
          if (list.length === 0) return null;
          return (
            <div className="bgroup" key={b}>
              <div className="bgroup-h">{BUCKET[b]} <span>{list.length}</span></div>
              <div className="tcards">
                {list.map((t) => <Card key={t.id} t={t} mode="new" />)}
              </div>
            </div>
          );
        })}
      </section>

      {undated.length > 0 && (
        <section>
          <h2>Spoken to, no date on record <span className="count">{undated.length}</span></h2>
          <p className="note">
            You have met these people but nothing records when, so cadence cannot fire. Tell me the
            month and they slot into the right queue.
          </p>
          <div className="tcards">
            {undated.map((t) => <Card key={t.id} t={t} mode="catch" />)}
          </div>
        </section>
      )}

      {current.length > 0 && (
        <section>
          <h2>Current, nothing needed <span className="count">{current.length}</span></h2>
          <p className="note">Inside cadence. Shown so you know they were considered.</p>
          <div className="panel">
            <table>
              <thead><tr><th>Who</th><th>Firm</th><th>Last touch</th><th>Due in</th>
                <th>Open action</th></tr></thead>
              <tbody>
                {current.map((t) => (
                  <tr key={t.id}>
                    <td className="co">{t.name}</td>
                    <td className="mono dim">{t.firm}</td>
                    <td className="mono">{t.days_since}d ago</td>
                    <td className="mono dim">{t.due_in}d</td>
                    <td className="mono dim">{t.next_action ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer>
        Relationship state from the Notion Investor Pipeline, profiles from Apollo, cadence from
        tier. Deals mirrored from Slack #deal-sharing.
      </footer>

      {/* Docked so it is on screen during a call, which is what the list is for. */}
      <aside className="dealdock">
        <div className="dealdock-h">Deals to share <span>{deals.length}</span></div>
        <div className="dealdock-b">
          {deals.map((d) => (
            <div className="deal" key={d.id}>
              <div className="deal-h">
                <span className="n">{d.company}</span>
                {d.arr && <span className="mono dim">{d.arr}</span>}
              </div>
              {d.what && <div className="deal-w">{d.what}</div>}
              <div className="deal-m">
                {d.growth && <span className="chip">{d.growth}</span>}
                {d.source && <span className="src">{d.source}</span>}
              </div>
              {d.detail && <div className="deal-d">{d.detail}</div>}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Card({ t, mode }: { t: Row; mode: 'new' | 'catch' }) {
  const done = t.status !== 'todo';
  return (
    <div className={`tcard st-${t.status}${t.verified ? '' : ' unver'}`}>
      <div className="tc-head">
        <div>
          <span className="who">{t.name}</span>
          <span className="role">{[t.title, t.firm].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="tc-badges">
          {t.tier_num && <span className={`pill tier t${t.tier_num}`}>T{t.tier_num}</span>}
          {mode === 'catch' && (
          <span className="pill r2">{t.days_since !== null ? `${t.days_since}d` : 'no date'}</span>
        )}
          {done && <span className="pill ok">{t.status}</span>}
        </div>
      </div>

      {t.invests_in && <p className="invests">{t.invests_in}</p>}
      {t.relevant_cos && (
        <div className="track">
          <span className="lbl">Shared</span>
          {t.relevant_cos.split(',').map((x) => (
            <span className="chip" key={x}>{x.trim()}</span>
          ))}
        </div>
      )}
      {t.next_action && (
        <p className="nextact"><b>Open:</b> {t.next_action}</p>
      )}
      {t.why && <p className="why">{t.why}</p>}
      {!t.verified && t.note && <p className="unvernote">{t.note}</p>}

      {t.message && (
        <div className="msg">
          <div className="msg-l">{mode === 'catch' ? 'Catch-up note' : 'Opener'}</div>
          <p>{t.message}</p>
        </div>
      )}

      <div className="tc-foot">
        {t.linkedin
          ? <a href={t.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
          : <span className="mono dim">no LinkedIn</span>}
        {t.email && <a href={`mailto:${t.email}`}>{t.email}</a>}
        <span className="grow" />
        <form action={setTargetStatus}>
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="to" value={done ? 'todo' : 'sent'} />
          <button type="submit">{done ? 'Undo' : 'Mark sent'}</button>
        </form>
      </div>
    </div>
  );
}
