import { db } from '@/lib/supabase';
import { Nav } from '../nav';
import { toggleBigThing, toggleMeeting } from '../actions';
import { TaskRow, MeetingRow, LABEL, ptMinutes, type Task, type Meeting } from '../lib-os';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

const longDate = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  });

export default async function Dashboard() {
  const s = db();
  const today = todayPT();

  const { data: weeks } = await s.from('os_week').select('*')
    .order('week_of', { ascending: false }).limit(8);
  const week = (weeks ?? []).find((w: any) => w.status === 'active') ?? (weeks ?? [])[0] ?? null;
  const weekOf: string | null = week?.week_of ?? null;
  const weekEnd = weekOf
    ? new Date(Date.parse(weekOf + 'T12:00:00Z') + 4 * 864e5).toISOString().slice(0, 10)
    : null;

  // Today, unless today has nothing on it, in which case the next planned day.
  const { data: planned } = await s.from('os_task')
    .select('day').gte('day', today).order('day').limit(80);
  const focusDay: string = (planned ?? []).some((r: any) => r.day === today)
    ? today : ((planned ?? [])[0]?.day ?? today);
  const isToday = focusDay === today;

  const [bigRes, taskRes, meetRes, progRes] = await Promise.all([
    s.from('os_big_three').select('*').eq('day', focusDay).order('rank'),
    s.from('v_os_task').select('*').eq('day', focusDay).order('sort'),
    weekOf
      ? s.from('v_os_meeting').select('*').gte('day', weekOf).lte('day', weekEnd!).order('starts_at')
      : Promise.resolve({ data: [] as any[] }),
    weekOf
      ? s.from('v_os_call_progress').select('*').eq('week_of', weekOf).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const big = (bigRes.data ?? []) as any[];
  const tasks = (taskRes.data ?? []) as Task[];
  const meetings = (meetRes.data ?? []) as Meeting[];
  const prog = progRes.data as any;

  const goal = Number(prog?.calls_goal ?? 10);
  const booked = Number(prog?.booked ?? 0);
  const held = Number(prog?.held ?? 0);
  const catchUps = Number(prog?.catch_ups ?? 0);

  const days = DOW.map((label, i) => ({
    label,
    date: weekOf
      ? new Date(Date.parse(weekOf + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10)
      : '',
  }));

  // The day, meetings and tasks together, in the order it actually runs.
  type Slot = { min: number; m?: Meeting; t?: Task };
  const slots: Slot[] = [
    ...meetings.filter((m) => m.day === focusDay).map((m) => ({ min: ptMinutes(m.starts_at), m })),
    ...tasks.map((t) => ({ min: t.start_min ?? 9999, t })),
  ].sort((a, b) => a.min - b.min);

  const dayPart = slots.filter((x) => x.min < 1080);
  const evePart = slots.filter((x) => x.min >= 1080);

  const cat = (c: string) => meetings.filter((m) => m.category === c);
  const others = meetings.filter((m) => ['expert', 'internal', 'other', 'reference'].includes(m.category));

  return (
    <div className="wrap">
      <Nav current="/dashboard" />

      {/* The three big things. Nothing else at the top. */}
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
                <form className={`b3${b.status === 'done' ? ' is-done' : ''}`} key={b.id}
                      action={toggleBigThing}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="to" value={b.status === 'done' ? 'open' : 'done'} />
                  <span className="n">{b.rank}</span>
                  <span className="t">{b.title}{b.note && <em>{b.note}</em>}</span>
                  <button className="box" type="submit" aria-label="Toggle">
                    {b.status === 'done' ? '✓' : ''}
                  </button>
                </form>
              ))}
        </div>
      </section>

      {/* Daily view. */}
      <section>
        <h2>
          {isToday ? 'Today' : longDate(focusDay)}
          <span className="count">
            {tasks.filter((t) => t.status === 'open').length} open
            {evePart.some((x) => x.t) && ` · ${evePart.filter((x) => x.t).length} tonight`}
          </span>
        </h2>
        {!isToday && (
          <p className="note">Nothing left on {longDate(today)}. This is the next planned day.</p>
        )}
        <div className="panel">
          <div className="rows">
            {slots.length === 0 && <div className="empty">Nothing scheduled.</div>}
            {dayPart.map((x, i) =>
              x.m ? <MeetingRow key={'m' + i} m={x.m} /> : <TaskRow key={'t' + i} t={x.t!} />)}
            {evePart.length > 0 && <div className="rowbreak"><span>Evening</span></div>}
            {evePart.map((x, i) =>
              x.m ? <MeetingRow key={'em' + i} m={x.m} /> : <TaskRow key={'et' + i} t={x.t!} />)}
          </div>
        </div>
      </section>

      {/* Company calls, against the 10 a week target. */}
      <section>
        <h2>
          Company calls this week
          <span className="count">{booked} of {goal}</span>
        </h2>
        <div className="goal">
          <div className="goal-track">
            {Array.from({ length: goal }, (_, i) => (
              <span className={`pip${i < held ? ' held' : i < booked ? ' booked' : ''}`} key={i} />
            ))}
          </div>
          <div className="goal-read">
            <b>{held}</b> held, <b>{booked - held}</b> still booked,{' '}
            {booked >= goal
              ? <span className="ok-txt">target met</span>
              : <span className="gap-txt">{goal - booked} short of {goal}</span>}
            {catchUps > 0 && ` · ${catchUps} catch-up${catchUps === 1 ? '' : 's'} not counted`}
          </div>
        </div>
        {cat('company').length === 0 ? (
          <div className="panel"><div className="empty">None booked.</div></div>
        ) : (
          <div className="mcards">
            {cat('company').map((m) => {
              const heldNow = m.status === 'done';
              return (
                <div className={`mcard${heldNow ? ' is-held' : ''}`} key={m.external_id}>
                  <div className="mc-head">
                    <span className="org">{m.org ?? m.summary}</span>
                    <span className="mono dim">{m.day.slice(5)} {m.time_label}</span>
                    <form action={toggleMeeting}>
                      <input type="hidden" name="id" value={m.external_id} />
                      <input type="hidden" name="to" value={heldNow ? 'scheduled' : 'done'} />
                      <button className="mbox" type="submit"
                              aria-label={heldNow ? 'Mark not held' : 'Mark held'}>
                        {heldNow ? '✓' : ''}
                      </button>
                    </form>
                  </div>
                  <span className={m.conversation_type === 'catch_up' ? 'lab' : 'held-tag'}>
                    {m.conversation_type === 'catch_up' ? 'catch-up, not counted'
                      : heldNow ? 'held' : 'net new'}
                  </span>
                  {m.counterpart && <p className="one">{[m.counterpart, m.title].filter(Boolean).join(' · ')}</p>}
                  {m.one_liner
                    ? <p className="one">{m.one_liner}</p>
                    : <p className="one gap">No one-liner yet</p>}
                  {m.focus && <p className="focus">{m.focus}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Investor calls. */}
      <section>
        <h2>Investor calls this week <span className="count">{cat('investor').length}</span></h2>
        {cat('investor').length === 0 ? (
          <div className="panel"><div className="empty">None this week.</div></div>
        ) : (
          <div className="mcards">
            {cat('investor').map((m) => (
              <div className="mcard" key={m.external_id}>
                <div className="mc-head">
                  <span className="org">{m.counterpart ?? m.org}</span>
                  <span className="mono dim">{m.day.slice(5)} {m.time_label}</span>
                </div>
                <p className="one">{[m.title, m.firm ?? m.org].filter(Boolean).join(' · ')}</p>
                {m.invests_in
                  ? <p className="focus">{m.invests_in}</p>
                  : <p className="one gap">What they invest in: not filled in</p>}
                {m.focus && <p className="one">{m.focus}</p>}
                {m.track && m.track.length > 0 ? (
                  <div className="track">
                    <span className="lbl">Bring up</span>
                    {m.track.map((d) => <span className="chip" key={d}>{d}</span>)}
                  </div>
                ) : (
                  <div className="track"><span className="lbl gap">Nothing to track yet</span></div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Everything else, a column per day. */}
      <section>
        <h2>
          Other meetings this week
          <span className="count">
            {others.length} · {cat('expert').length} expert
          </span>
        </h2>
        <p className="note">Expert and reference calls carry the deal they serve.</p>
        <div className="panel">
          <div className="daycols">
            {days.map((d) => {
              const rows = others.filter((m) => m.day === d.date);
              return (
                <div className={`daycol${d.date === today ? ' is-today' : ''}`} key={d.date}>
                  <div className="daycol-head">
                    {d.label} <em>{d.date.slice(5)}</em>
                    {rows.length > 0 && <span className="cnt">{rows.length}</span>}
                  </div>
                  <div className="daycol-body">
                    {rows.length === 0 && <div className="wkempty">clear</div>}
                    {rows.map((m) => (
                      <div className={`mini c-${m.category}${m.status === 'done' ? ' is-done' : ''}`}
                           key={m.external_id}>
                        <span className="t">{m.time_label}</span>
                        <span className="n">{m.org ?? m.summary}</span>
                        <span className="l">
                          {LABEL[m.category] ?? m.category}
                          {m.deal && <em> · {m.deal}</em>}
                        </span>
                        {m.focus && <span className="f">{m.focus}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer>
        Week set from <span className="mono">plans/{weekOf}.json</span> via os_plan.js.
        Calendar is read only; to-dos push out as Google Tasks.
      </footer>
    </div>
  );
}
