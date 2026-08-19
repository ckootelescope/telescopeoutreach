import { db } from '@/lib/supabase';
import { Nav } from '../nav';
import { setTargetStatus } from '../actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * People at peer firms worth Calvin's time, with the opener already written.
 *
 * The buckets are the only judgement here, and they are about Telescope's
 * position rather than the firm's prestige: who co-invests at our stage, who
 * sees companies before we do, who takes them on afterwards, and who brings
 * strategic money.
 */
const BUCKETS = [
  { k: 'coinvest', h: 'Co-invest at Series A',
    d: 'Same stage as us. Shared dealflow is the point of the relationship.' },
  { k: 'upstream', h: 'Upstream, seed and pre-seed',
    d: 'They see companies a round before we can. Be who they call at the A.' },
  { k: 'downstream', h: 'Downstream, Series B and later',
    d: 'Where our portfolio raises next. Worth knowing before we need them.' },
  { k: 'corporate', h: 'Corporate and strategic',
    d: 'Strategic money and customer introductions rather than shared dealflow.' },
] as const;

type Target = {
  id: number; name: string; firm: string; title: string | null; linkedin: string | null;
  email: string | null; bucket: string; invests_in: string | null; why: string | null;
  message: string | null; status: string; verified: boolean; note: string | null;
};

export default async function Investors() {
  const s = db();
  const { data } = await s.from('os_investor_target').select('*').order('sort');
  const rows = (data ?? []) as Target[];

  const todo = rows.filter((r) => r.status === 'todo').length;
  const unver = rows.filter((r) => !r.verified).length;

  return (
    <div className="wrap">
      <Nav current="/investors" />

      <div className="kpis">
        <div className="kpi"><div className="k">On the list</div><div className="v">{rows.length}</div>
          <div className="s">from AS BD targets</div></div>
        <div className="kpi"><div className="k">Not contacted</div><div className="v">{todo}</div>
          <div className="s">openers written</div></div>
        <div className="kpi"><div className="k">Sent</div><div className="v">
          {rows.filter((r) => r.status !== 'todo' && r.status !== 'skip').length}</div>
          <div className="s">reached out</div></div>
        <div className={`kpi ${unver ? 'warn' : 'ok'}`}><div className="k">Need verifying</div>
          <div className="v">{unver}</div>
          <div className="s">{unver ? 'stale or unmatched' : 'all confirmed'}</div></div>
      </div>

      {unver > 0 && (
        <p className="note">
          Rows flagged amber did not verify cleanly against Apollo. Two people have changed firm
          since the sheet was written and one match was the wrong person. Confirm the seat before
          sending those.
        </p>
      )}

      {BUCKETS.map((b) => {
        const list = rows.filter((r) => r.bucket === b.k);
        if (list.length === 0) return null;
        return (
          <section key={b.k}>
            <h2>{b.h} <span className="count">{list.length}</span></h2>
            <p className="note">{b.d}</p>
            <div className="tcards">
              {list.map((t) => (
                <div className={`tcard st-${t.status}${t.verified ? '' : ' unver'}`} key={t.id}>
                  <div className="tc-head">
                    <div>
                      <span className="who">{t.name}</span>
                      <span className="role">{[t.title, t.firm].filter(Boolean).join(' · ')}</span>
                    </div>
                    <span className={`pill ${t.status === 'todo' ? '' : 'ok'}`}>{t.status}</span>
                  </div>

                  {t.invests_in && <p className="invests">{t.invests_in}</p>}
                  {t.why && <p className="why">{t.why}</p>}
                  {!t.verified && t.note && <p className="unvernote">{t.note}</p>}

                  {t.message && (
                    <div className="msg">
                      <div className="msg-l">Opener</div>
                      <p>{t.message}</p>
                    </div>
                  )}

                  <div className="tc-foot">
                    {t.linkedin
                      ? <a href={t.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
                      : <span className="mono dim">no LinkedIn found</span>}
                    {t.email && <a href={`mailto:${t.email}`}>{t.email}</a>}
                    <span className="grow" />
                    <form action={setTargetStatus}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="to" value={t.status === 'todo' ? 'sent' : 'todo'} />
                      <button type="submit">
                        {t.status === 'todo' ? 'Mark sent' : 'Undo'}
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <footer>
        Names from the AS BD targets tab, roles and profiles from Apollo, openers drafted here.
        Not a task list: the research is done, these are ready to send.
      </footer>
    </div>
  );
}
