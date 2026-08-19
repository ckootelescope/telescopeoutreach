import { db } from '@/lib/supabase';
import { Nav } from '../nav';
import { TaskRow, LABEL, ptMinutes, clock, type Task, type Meeting } from '../lib-os';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 8am to midnight. The evenings are the point: deep work is scheduled at night,
// and a grid that stops at 6 hides exactly the blocks Calvin needs to keep free.
const FROM = 8 * 60;
const TO = 24 * 60;
const PX = 0.72;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
const DEFAULT_MEETING_MIN = 30;

const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const top = (min: number) => (Math.max(FROM, min) - FROM) * PX;
const high = (a: number, b: number) => Math.max(15, (Math.min(TO, b) - Math.max(FROM, a)) * PX - 2);

export default async function WeekCalendar() {
  const s = db();
  const today = todayPT();

  const { data: weeks } = await s.from('os_week').select('*')
    .order('week_of', { ascending: false }).limit(8);
  const week = (weeks ?? []).find((w: any) => w.status === 'active') ?? (weeks ?? [])[0] ?? null;

  if (!week) {
    return (
      <div className="wrap">
        <Nav current="/week" />
        <section>
          <h2>No week planned</h2>
          <div className="panel"><div className="empty">Run os_plan.js with a week file.</div></div>
        </section>
      </div>
    );
  }

  const days = DOW.map((label, i) => ({
    label,
    date: new Date(Date.parse(week.week_of + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10),
  }));
  const last = days[days.length - 1].date;

  const [taskRes, meetRes] = await Promise.all([
    s.from('v_os_task').select('*').gte('day', week.week_of).order('sort'),
    s.from('v_os_meeting').select('*').gte('day', week.week_of).lte('day', last).order('starts_at'),
  ]);

  const tasks = (taskRes.data ?? []) as Task[];
  const meets = (meetRes.data ?? []) as Meeting[];

  const hours: number[] = [];
  for (let m = FROM; m <= TO; m += 60) hours.push(m);

  const inWeek = (d: string) => days.some((x) => x.date === d);
  const open = tasks.filter((t) => t.status === 'open').length;
  const nights = [...new Set(
    tasks.filter((t) => (t.start_min ?? 0) >= 1080 && inWeek(t.day)).map((t) => t.day),
  )].sort();
  const counts = ['company', 'investor', 'expert', 'reference', 'internal', 'other']
    .map((c) => ({ c, n: meets.filter((m) => m.category === c).length }))
    .filter((x) => x.n > 0);
  const later = tasks.filter((t) => !inWeek(t.day));

  return (
    <div className="wrap">
      <Nav current="/week" />

      <section>
        <h2>
          Week of {week.week_of}
          <span className="count">
            {counts.map((x) => `${x.n} ${LABEL[x.c].toLowerCase()}`).join(' · ')}
          </span>
        </h2>
        <p className="note">
          Sourcing runs in the working day, reading and deep work at night.{' '}
          {nights.length > 0
            ? `Evenings booked: ${nights.map((d) =>
                new Date(d + 'T12:00:00Z')
                  .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })).join(', ')}.`
            : 'No evening blocks.'}
        </p>

        <div className="weeksplit">
          <div className="panel">
            <div className="cal">
              <div className="cal-rail">
                <div className="cal-corner" />
                <div className="cal-hours" style={{ height: (TO - FROM) * PX }}>
                  {hours.map((m) => (
                    <span className="cal-hr" key={m} style={{ top: top(m) }}>{clock(m)}</span>
                  ))}
                </div>
              </div>

              {days.map((d) => {
                const dayTasks = tasks.filter((t) => t.day === d.date && t.start_min !== null);
                const dayMeets = meets.filter((m) => m.day === d.date);
                return (
                  <div className={`cal-col${d.date === today ? ' is-today' : ''}`} key={d.date}>
                    <div className="cal-head">{d.label} <em>{d.date.slice(5)}</em></div>
                    <div className="cal-body" style={{ height: (TO - FROM) * PX }}>
                      {hours.map((m) => (
                        <div className="cal-line" key={m} style={{ top: top(m) }} />
                      ))}

                      {dayMeets.map((m) => {
                        const a = ptMinutes(m.starts_at);
                        const b = m.ends_at ? ptMinutes(m.ends_at) : a + DEFAULT_MEETING_MIN;
                        return (
                          <div
                            className={`blk c-${m.category}${m.status === 'done' ? ' is-done' : ''}`}
                            key={m.external_id}
                            style={{ top: top(a), height: high(a, b) }}
                            title={`${clock(a)} · ${LABEL[m.category]}${m.deal ? ' · ' + m.deal : ''} · ${m.org ?? m.summary}`}
                          >
                            <span className="bt">{clock(a)}<em>{LABEL[m.category]}</em></span>
                            <span className="bn">{m.org ?? m.summary}</span>
                          </div>
                        );
                      })}

                      {dayTasks.map((t) => {
                        const b = t.end_min ?? t.start_min! + 60;
                        return (
                          <div
                            className={`blk task s-${t.stream}${t.status === 'done' ? ' is-done' : ''}`}
                            key={t.id}
                            style={{ top: top(t.start_min!), height: high(t.start_min!, b) }}
                            title={`${clock(t.start_min!)}-${clock(b)} ${t.subject ? t.subject + ': ' : ''}${t.title}`}
                          >
                            <span className="bt">{clock(t.start_min!)}<em>task</em></span>
                            <span className="bn">
                              {t.subject && <b>{t.subject}</b>}{t.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="legend">
              {counts.map((x) => (
                <span key={x.c}><i className={`c-${x.c}`} />{LABEL[x.c]}</span>
              ))}
              <span><i className="task-key" />Your tasks</span>
            </div>
          </div>

          {/* every task in the week, checkable and reorderable */}
          <aside className="side">
            <div className="side-head">
              Tasks this week
              <span className="cnt">{open} open</span>
            </div>
            <div className="side-body">
              {tasks.length === 0 && <div className="empty">No tasks.</div>}
              {days.map((d) => {
                const rows = tasks.filter((t) => t.day === d.date);
                if (rows.length === 0) return null;
                return (
                  <div className="side-day" key={d.date}>
                    <div className={`side-dh${d.date === today ? ' is-today' : ''}`}>
                      {d.label} <em>{d.date.slice(5)}</em>
                    </div>
                    <div className="rows tight">
                      {rows.map((t) => <TaskRow key={t.id} t={t} reorder />)}
                    </div>
                  </div>
                );
              })}
              {later.length > 0 && (
                <div className="side-day">
                  <div className="side-dh">Later</div>
                  <div className="rows tight">
                    {later.map((t) => <TaskRow key={t.id} t={t} reorder />)}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      <footer>
        Arrows reorder within a day. Blocks come from <span className="mono">os_plan.js</span>;
        meetings are read from Google Calendar and labelled from their brief.
      </footer>
    </div>
  );
}
