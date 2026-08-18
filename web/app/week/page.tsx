import { db } from '@/lib/supabase';
import { Nav } from '../nav';
import { Chat } from './chat';
import { toggleTask, deferTask } from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

/** Today in Pacific. Dates in this database are Pacific days, not UTC ones. */
const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

/** The five days of a week starting from its Monday. */
function weekDays(weekOf: string) {
  const base = Date.parse(weekOf + 'T12:00:00Z');
  return DAYS.map((label, i) => {
    const d = new Date(base + i * 864e5);
    return { label, date: d.toISOString().slice(0, 10) };
  });
}

const hhmm = (ts: string) =>
  new Date(ts).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit',
  }).replace(' ', '').toLowerCase();

type Task = {
  id: number; title: string; notes: string | null; stream: string;
  subject: string | null; day: string | null; due_on: string | null;
  origin: string; status: string; gtask_id: string | null;
};

type Event = { external_id: string; summary: string; starts_at: string; day: string };

const STREAMS: Record<string, string> = {
  diligence: 'Diligence', sourcing: 'Sourcing', investor: 'Investor',
  market: 'Market', learning: 'Learning',
};

export default async function Week() {
  const s = db();
  const today = todayPT();

  // The active week is the one being worked. Falls back to the newest, so the
  // page is never blank just because Friday closed it.
  const { data: weeks } = await s
    .from('os_week')
    .select('*')
    .order('week_of', { ascending: false })
    .limit(8);

  const week = (weeks ?? []).find((w: any) => w.status === 'active') ?? (weeks ?? [])[0] ?? null;

  if (!week) {
    return (
      <div className="wrap">
        <Nav current="/week" />
        <section>
          <h2>No week yet</h2>
          <div className="panel">
            <div className="empty">
              Nothing planned. Describe the week below and it will be built from what you say.
            </div>
          </div>
        </section>
        <Chat weekOf={null} intent={null} />
      </div>
    );
  }

  const days = weekDays(week.week_of);
  const last = days[days.length - 1].date;

  const [taskRes, evRes, prioRes, dueRes, unsentRes, waitingRes, msgRes] = await Promise.all([
    s.from('v_os_task').select('*').eq('week_id', week.id).order('sort'),
    s.from('os_calendar_event').select('external_id,summary,starts_at,day')
      .gte('day', week.week_of).lte('day', last).order('starts_at'),
    s.from('v_os_priority').select('*'),
    s.from('dash_due').select('company,step_no,due_date,kind'),
    s.from('dash_drafted_not_sent').select('*'),
    s.from('v_awaiting_reply').select('*'),
    s.from('os_message').select('*').eq('week_id', week.id)
      .order('created_at', { ascending: false }).limit(8),
  ]);

  const tasks = (taskRes.data ?? []) as Task[];
  const events = (evRes.data ?? []) as Event[];
  const prio = (prioRes.data ?? []) as any[];
  const messages = ((msgRes.data ?? []) as any[]).slice().reverse();

  const dated = (d: string) => tasks.filter((t) => t.day === d);
  const undated = tasks.filter((t) => !t.day);

  const open = tasks.filter((t) => t.status === 'open').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const byStream = Object.keys(STREAMS)
    .map((k) => ({ k, n: tasks.filter((t) => t.stream === k && t.status === 'open').length }))
    .filter((x) => x.n > 0);

  const overdue = (dueRes.data ?? []).filter((d: any) => d.due_date < today).length;

  const kpis = [
    { k: 'Open this week', v: open, sub: `${done} done`, tone: '' },
    { k: 'No day yet', v: undated.filter((t) => t.status === 'open').length, sub: 'weekly items', tone: '' },
    { k: 'Follow-ups due', v: (dueRes.data ?? []).length,
      sub: overdue ? `${overdue} overdue` : 'nothing late', tone: overdue ? 'stop' : '' },
    { k: 'Drafted, unsent', v: (unsentRes.data ?? []).length, sub: 'waiting on you',
      tone: (unsentRes.data ?? []).length ? 'warn' : 'ok' },
    { k: 'Awaiting reply', v: (waitingRes.data ?? []).length, sub: 'sent, no answer', tone: '' },
    { k: 'Pushed to Tasks', v: tasks.filter((t) => t.gtask_id).length,
      sub: tasks.filter((t) => t.gtask_id).length ? 'in Google Tasks' : 'not synced yet',
      tone: tasks.filter((t) => t.gtask_id).length ? 'ok' : 'warn' },
  ];

  return (
    <div className="wrap">
      <Nav current="/week" />

      <div className="kpis">
        {kpis.map((k) => (
          <div className={`kpi ${k.tone}`} key={k.k}>
            <div className="k">{k.k}</div>
            <div className="v">{k.v}</div>
            <div className="s">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Calvin's declared order. Nothing infers this. */}
      <section>
        <h2>Priority order <span className="count">you set this</span></h2>
        <div className="panel">
          <div className="prio">
            {prio.length === 0 ? (
              <div className="empty">No order declared. Tell the chat what ranks where.</div>
            ) : (
              prio.map((p) => (
                <div className="prio-row" key={p.id}>
                  <span className="rank">{p.rank}</span>
                  <span className="who">{p.display}</span>
                  <span className={`pill ${p.kind === 'stream' ? 'r2' : 'r1'}`}>{p.kind}</span>
                  <span className="mono dim">{p.note ?? ''}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section>
        <h2>
          Week of {week.week_of}
          <span className="count">
            {byStream.map((x) => `${x.n} ${STREAMS[x.k].toLowerCase()}`).join(' · ')}
          </span>
        </h2>
        <p className="note">
          Grey is on your calendar and cannot move. Everything else came from what you said.
          Check a box to close it; the arrow pushes it off the week and keeps it on its subject.
        </p>

        <div className="panel">
          <div className="wkgrid">
            {/* Weekly items: real commitments with no natural day. */}
            <div className="wkcol nodate">
              <div className="wkhead">
                This week <em>no day</em>
              </div>
              <div className="wkbody">
                {undated.length === 0 && <div className="wkempty">nothing</div>}
                {undated.map((t) => <Row key={t.id} t={t} />)}
              </div>
            </div>

            {days.map((d) => {
              const evs = events.filter((e) => e.day === d.date);
              const ts = dated(d.date);
              return (
                <div className={`wkcol${d.date === today ? ' is-today' : ''}`} key={d.date}>
                  <div className="wkhead">
                    {d.label} <em>{d.date.slice(5)}</em>
                  </div>
                  <div className="wkbody">
                    {evs.map((e) => (
                      <div className="ev" key={e.external_id}>
                        <span className="t">{hhmm(e.starts_at)}</span> {e.summary}
                      </div>
                    ))}
                    {evs.length > 0 && ts.length > 0 && <div className="evrule" />}
                    {evs.length === 0 && ts.length === 0 && <div className="wkempty">clear</div>}
                    {ts.map((t) => <Row key={t.id} t={t} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Chat weekOf={week.week_of} intent={week.intent} messages={messages} />

      {/* Pull, not push. Context sits here; it never becomes a task on its own. */}
      <section>
        <h2>Outreach state <span className="count">context, not tasks</span></h2>
        <p className="note">
          Nothing here is on your list unless you put it there. Ask the chat to pull any of it in.
        </p>
        <div className="two">
          <div className="panel">
            <table>
              <thead><tr><th>Due now</th><th>Step</th><th>Date</th></tr></thead>
              <tbody>
                {(dueRes.data ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="empty">Nothing due.</td></tr>
                ) : (
                  (dueRes.data ?? []).slice(0, 10).map((d: any, i: number) => (
                    <tr key={i} className={d.due_date < today ? 'warn' : ''}>
                      <td className="co">{d.company}</td>
                      <td className="mono dim">
                        <span className={`pill ${d.kind === 'restart' ? 'r2' : 'r1'}`}>
                          {d.kind === 'restart' ? 'R2' : 'R1'}
                        </span>{' '}Email {d.step_no}
                      </td>
                      <td className="mono">{d.due_date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <table>
              <thead><tr><th>Drafted, not sent</th><th>Step</th><th>Drafted</th></tr></thead>
              <tbody>
                {(unsentRes.data ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="empty">No drafts waiting.</td></tr>
                ) : (
                  (unsentRes.data ?? []).slice(0, 10).map((d: any, i: number) => (
                    <tr key={i}>
                      <td className="co">{d.company}</td>
                      <td className="mono dim">Email {d.step_no}</td>
                      <td className="mono">{String(d.drafted_on ?? '').slice(0, 10)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <footer>
        To-dos push to Google Tasks, never to your calendar, so tasks and real meetings stay
        filterable apart. Run <span className="mono">node scripts/os_sync.js --tasks --apply</span> to push.
      </footer>
    </div>
  );
}

/** One to-do. A form, so the checkbox works without client JavaScript. */
function Row({ t }: { t: Task }) {
  const doneNow = t.status === 'done';
  return (
    <div className={`td s-${t.stream}${doneNow ? ' is-done' : ''}`}>
      <form action={toggleTask}>
        <input type="hidden" name="id" value={t.id} />
        <input type="hidden" name="to" value={doneNow ? 'open' : 'done'} />
        <button className="box" type="submit" aria-label={doneNow ? 'Reopen' : 'Mark done'}>
          {doneNow ? '✓' : ''}
        </button>
      </form>
      <div className="body">
        <div className="line">
          {t.subject && <b>{t.subject}</b>}
          <span>{t.title}</span>
        </div>
        {t.notes && <div className="why">{t.notes}</div>}
        {t.due_on && !t.day && <div className="why">due {t.due_on}</div>}
        {t.origin !== 'calvin' && (
          <span className="tag">{t.origin === 'expanded' ? 'expanded' : 'you asked for this'}</span>
        )}
      </div>
      {!doneNow && (
        <form action={deferTask}>
          <input type="hidden" name="id" value={t.id} />
          <button className="push" type="submit" title="Push off the week, keep on its subject">
            &rarr;
          </button>
        </form>
      )}
    </div>
  );
}
