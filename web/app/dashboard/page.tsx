import { db } from '@/lib/supabase';
import { Nav } from '../nav';
import { toggleTask, toggleBigThing } from '../actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

const longDate = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  });

/** Minutes from Pacific midnight, for sorting meetings against task blocks. */
function ptMinutes(ts: string) {
  const s = new Date(ts).toLocaleTimeString('en-GB', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

const clock = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  const ap = h >= 12 && h < 24 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, '0')}${ap}`;
};

type Task = {
  id: number; title: string; notes: string | null; stream: string; subject: string | null;
  day: string; start_min: number | null; end_min: number | null; status: string;
  origin: string; calendar_ref: string | null;
};

type Meeting = {
  external_id: string; summary: string; starts_at: string; day: string;
  category: string; org: string | null; counterpart: string | null; title: string | null;
  one_liner: string | null; focus: string | null;
  firm: string | null; invests_in: string | null; track: string[] | null;
};

export default async function Dashboard() {
  const s = db();
  const today = todayPT();

  // The week being worked. Meetings and cards are scoped to it.
  const { data: weeks } = await s.from('os_week').select('*')
    .order('week_of', { ascending: false }).limit(8);
  const week = (weeks ?? []).find((w: any) => w.status === 'active') ?? (weeks ?? [])[0] ?? null;
  const weekOf: string | null = week?.week_of ?? null;
  const weekEnd = weekOf
    ? new Date(Date.parse(weekOf + 'T12:00:00Z') + 4 * 864e5).toISOString().slice(0, 10)
    : null;

  // Which day the dashboard is about. Today, unless today is unplanned, in
  // which case the next day that has work on it. An empty page is not useful.
  const { data: plannedDays } = await s.from('os_task')
    .select('day').gte('day', today).order('day').limit(60);
  const focusDay: string =
    (plannedDays ?? []).some((r: any) => r.day === today) ? today
      : ((plannedDays ?? [])[0]?.day ?? today);
  const isToday = focusDay === today;

  const [bigRes, taskRes, meetRes] = await Promise.all([
    s.from('os_big_three').select('*').eq('day', focusDay).order('rank'),
    s.from('v_os_task').select('*').eq('day', focusDay).order('start_min'),
    weekOf
      ? s.from('v_os_meeting').select('*').gte('day', weekOf).lte('day', weekEnd!).order('starts_at')
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const big = (bigRes.data ?? []) as any[];
  const tasks = (taskRes.data ?? []) as Task[];
  const meetings = (meetRes.data ?? []) as Meeting[];

  const dayMeetings = meetings.filter((m) => m.day === focusDay);

  // One timeline for the day: meetings and tasks in the order they happen.
  type Slot = { min: number; kind: 'meeting' | 'task'; m?: Meeting; t?: Task };
  const slots: Slot[] = [
    ...dayMeetings.map((m) => ({ min: ptMinutes(m.starts_at), kind: 'meeting' as const, m })),
    ...tasks.map((t) => ({ min: t.start_min ?? 9999, kind: 'task' as const, t })),
  ].sort((a, b) => a.min - b.min);

  const dayPart = slots.filter((x) => x.min < 1080);
  const evePart = slots.filter((x) => x.min >= 1080);

  const cards = (cat: string) => meetings.filter((m) => m.category === cat);

  return (
    <div className="wrap">
      <Nav current="/dashboard" />

      {/* The only thing at the top. Everything else is below the fold of attention. */}
      <section>
        <h2>
          Three big things
          <span className="count">{isToday ? 'today' : longDate(focusDay)}</span>
        </h2>
        <div className="big3">
          {big.length === 0
            ? [1, 2, 3].map((n) => (
                <div className="b3 empty-slot" key={n}>
                  <span className="n">{n}</span>
                  <span className="t">not set</span>
                </div>
              ))
            : big.map((b) => (
                <form className={`b3${b.status === 'done' ? ' is-done' : ''}`} key={b.id} action={toggleBigThing}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="to" value={b.status === 'done' ? 'open' : 'done'} />
                  <span className="n">{b.rank}</span>
                  <span className="t">
                    {b.title}
                    {b.note && <em>{b.note}</em>}
                  </span>
                  <button className="box" type="submit" aria-label="Toggle">
                    {b.status === 'done' ? '✓' : ''}
                  </button>
                </form>
              ))}
        </div>
      </section>

      {/* Daily view: what to get done, in the order the day runs. */}
      <section>
        <h2>
          {isToday ? 'Today' : longDate(focusDay)}
          <span className="count">
            {tasks.filter((t) => t.status === 'open').length} open
            {evePart.length ? ` · ${evePart.filter((x) => x.kind === 'task').length} evening` : ''}
          </span>
        </h2>
        {!isToday && (
          <p className="note">
            Nothing is scheduled for {longDate(today)}. This is the next day with work on it.
          </p>
        )}
        <div className="panel">
          <div className="tl">
            {dayPart.length === 0 && evePart.length === 0 && (
              <div className="empty">Nothing scheduled.</div>
            )}
            {dayPart.map((x, i) => <Slot key={'d' + i} x={x} />)}
            {evePart.length > 0 && (
              <div className="tl-break">
                <span>Evening</span>
              </div>
            )}
            {evePart.map((x, i) => <Slot key={'e' + i} x={x} />)}
          </div>
        </div>
      </section>

      {/* Company calls: what they do, and what to get out of the call. */}
      <MeetingBlock
        title="Company calls this week"
        rows={cards('company')}
        render={(m) => (
          <>
            <div className="mc-head">
              <span className="org">{m.org ?? m.summary}</span>
              <span className="mono dim">{longDate(m.day).split(',')[0]} {m.time_label ?? ''}</span>
            </div>
            {m.one_liner
              ? <p className="one">{m.one_liner}</p>
              : <p className="one gap">No one-liner yet</p>}
            {m.focus && <p className="focus">{m.focus}</p>}
          </>
        )}
      />

      {/* Investor calls: who they are, what they back, what to raise. */}
      <MeetingBlock
        title="Investor calls this week"
        rows={cards('investor')}
        render={(m) => (
          <>
            <div className="mc-head">
              <span className="org">{m.counterpart ?? m.org}</span>
              <span className="mono dim">{longDate(m.day).split(',')[0]} {m.time_label ?? ''}</span>
            </div>
            <p className="one">
              {[m.title, m.firm ?? m.org].filter(Boolean).join(' · ')}
            </p>
            {m.invests_in
              ? <p className="focus">{m.invests_in}</p>
              : <p className="one gap">What they invest in: not filled in</p>}
            {m.track && m.track.length > 0 ? (
              <div className="track">
                <span className="lbl">Bring up</span>
                {m.track.map((d) => <span className="chip" key={d}>{d}</span>)}
              </div>
            ) : (
              <div className="track"><span className="lbl gap">Nothing to track yet</span></div>
            )}
          </>
        )}
      />

      {/* Everything else: internal, operators, experts. Just the prep line. */}
      <MeetingBlock
        title="Other meetings this week"
        rows={[...cards('internal'), ...cards('other')].sort((a, b) =>
          a.starts_at < b.starts_at ? -1 : 1)}
        render={(m) => (
          <>
            <div className="mc-head">
              <span className="org">{m.counterpart ?? m.org ?? m.summary}</span>
              <span className="mono dim">{longDate(m.day).split(',')[0]} {m.time_label ?? ''}</span>
            </div>
            {m.counterpart && m.org && m.counterpart !== m.org && (
              <p className="one">{[m.title, m.org].filter(Boolean).join(' · ')}</p>
            )}
            {m.focus
              ? <p className="focus">{m.focus}</p>
              : <p className="one gap">No prep note yet</p>}
          </>
        )}
      />

      <footer>
        Days come from <span className="mono">node scripts/os_plan.js _week.json --apply</span>.
        Meetings are read from your calendar and never written to it.
      </footer>
    </div>
  );
}

function MeetingBlock({
  title, rows, render,
}: {
  title: string;
  rows: (Meeting & { time_label?: string })[];
  render: (m: Meeting & { time_label?: string }) => React.ReactNode;
}) {
  return (
    <section>
      <h2>{title} <span className="count">{rows.length}</span></h2>
      {rows.length === 0 ? (
        <div className="panel"><div className="empty">None this week.</div></div>
      ) : (
        <div className="mcards">
          {rows.map((m) => (
            <div className="mcard" key={m.external_id}>{render(m)}</div>
          ))}
        </div>
      )}
    </section>
  );
}

/** One row of the day: a meeting you cannot move, or a task you can close. */
function Slot({ x }: { x: { min: number; kind: 'meeting' | 'task'; m?: Meeting; t?: Task } }) {
  if (x.kind === 'meeting' && x.m) {
    return (
      <div className="tlrow is-fixed">
        <span className="when">{x.min === 9999 ? '' : clock(x.min)}</span>
        <span className="what">
          {x.m.org ?? x.m.summary}
          {x.m.counterpart && x.m.counterpart !== x.m.org ? ` · ${x.m.counterpart}` : ''}
        </span>
        <span className="tag">meeting</span>
      </div>
    );
  }
  const t = x.t!;
  const done = t.status === 'done';
  return (
    <div className={`tlrow s-${t.stream}${done ? ' is-done' : ''}`}>
      <span className="when">
        {t.start_min === null ? '' : clock(t.start_min)}
        {t.end_min !== null && <em>{clock(t.end_min)}</em>}
      </span>
      <span className="what">
        {t.subject && <b>{t.subject}</b>}
        {t.title}
        {t.notes && <em className="why">{t.notes}</em>}
      </span>
      <form action={toggleTask}>
        <input type="hidden" name="id" value={t.id} />
        <input type="hidden" name="to" value={done ? 'open' : 'done'} />
        <button className="box" type="submit" aria-label={done ? 'Reopen' : 'Mark done'}>
          {done ? '✓' : ''}
        </button>
      </form>
    </div>
  );
}
