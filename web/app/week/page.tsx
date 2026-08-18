import { db } from '@/lib/supabase';
import { Nav } from '../nav';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// The grid runs 8am to midnight because the evenings are the point: deep work
// gets scheduled at night, and a calendar that stops at 6 hides exactly the
// blocks Calvin needs to keep clear.
const FROM = 8 * 60;
const TO = 24 * 60;
const PX_PER_MIN = 0.78;          // 16 hours -> ~750px
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
const DEFAULT_MEETING_MIN = 45;   // most events here carry no end time

const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

function ptMinutes(ts: string) {
  const s = new Date(ts).toLocaleTimeString('en-GB', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

const clock = (min: number) => {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  const ap = Math.floor(min / 60) >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, '0')}${ap}`;
};

const top = (min: number) => (Math.max(FROM, min) - FROM) * PX_PER_MIN;
const height = (a: number, b: number) =>
  Math.max(18, (Math.min(TO, b) - Math.max(FROM, a)) * PX_PER_MIN - 2);

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
          <div className="panel">
            <div className="empty">
              Run node scripts/os_plan.js with a week file to fill this in.
            </div>
          </div>
        </section>
      </div>
    );
  }

  const days = DAYS.map((label, i) => ({
    label,
    date: new Date(Date.parse(week.week_of + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10),
  }));
  const last = days[days.length - 1].date;

  const [taskRes, meetRes] = await Promise.all([
    s.from('v_os_task').select('*').gte('day', week.week_of).lte('day', last).order('start_min'),
    s.from('v_os_meeting').select('*').gte('day', week.week_of).lte('day', last).order('starts_at'),
  ]);

  const tasks = (taskRes.data ?? []) as any[];
  const meets = (meetRes.data ?? []) as any[];

  const hours: number[] = [];
  for (let m = FROM; m <= TO; m += 60) hours.push(m);

  const evening = tasks.filter((t) => t.start_min >= 1080 && t.status !== 'dropped');
  const nights = [...new Set(evening.map((t) => t.day))].sort();

  return (
    <div className="wrap">
      <Nav current="/week" />

      <section>
        <h2>
          Week of {week.week_of}
          <span className="count">
            {tasks.length} blocks · {meets.length} meetings
          </span>
        </h2>
        <p className="note">
          Sourcing runs in the working day, reading and deep work at night.{' '}
          {nights.length > 0
            ? `Evenings to keep clear: ${nights
                .map((d) => new Date(d + 'T12:00:00Z')
                  .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }))
                .join(', ')}.`
            : 'No evening blocks this week.'}
        </p>

        <div className="panel">
          <div className="cal">
            {/* hour rail */}
            <div className="cal-rail">
              <div className="cal-corner" />
              <div className="cal-hours" style={{ height: (TO - FROM) * PX_PER_MIN }}>
                {hours.map((m) => (
                  <span className="cal-hr" key={m} style={{ top: top(m) }}>{clock(m)}</span>
                ))}
              </div>
            </div>

            {days.map((d) => {
              const dayTasks = tasks.filter((t) => t.day === d.date);
              const dayMeets = meets.filter((m) => m.day === d.date);
              return (
                <div className={`cal-col${d.date === today ? ' is-today' : ''}`} key={d.date}>
                  <div className="cal-head">
                    {d.label} <em>{d.date.slice(5)}</em>
                  </div>
                  <div className="cal-body" style={{ height: (TO - FROM) * PX_PER_MIN }}>
                    {hours.map((m) => (
                      <div className="cal-line" key={m} style={{ top: top(m) }} />
                    ))}

                    {dayMeets.map((m) => {
                      const a = ptMinutes(m.starts_at);
                      const b = m.ends_at ? ptMinutes(m.ends_at) : a + DEFAULT_MEETING_MIN;
                      return (
                        <div
                          className="blk is-meeting"
                          key={m.external_id}
                          style={{ top: top(a), height: height(a, b) }}
                          title={`${clock(a)} ${m.summary}`}
                        >
                          <span className="bt">{clock(a)}</span>
                          <span className="bn">{m.org ?? m.summary}</span>
                        </div>
                      );
                    })}

                    {dayTasks.map((t) => {
                      if (t.start_min === null) return null;
                      const b = t.end_min ?? t.start_min + 60;
                      return (
                        <div
                          className={`blk s-${t.stream}${t.status === 'done' ? ' is-done' : ''}`}
                          key={t.id}
                          style={{ top: top(t.start_min), height: height(t.start_min, b) }}
                          title={`${clock(t.start_min)}-${clock(b)} ${t.subject ? t.subject + ': ' : ''}${t.title}`}
                        >
                          <span className="bt">{clock(t.start_min)}</span>
                          <span className="bn">
                            {t.subject && <b>{t.subject}</b>}
                            {t.title}
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
            <span><i className="s-diligence" />Diligence</span>
            <span><i className="s-sourcing" />Sourcing</span>
            <span><i className="s-investor" />Investor</span>
            <span><i className="s-market" />Market</span>
            <span><i className="s-learning" />Learning</span>
            <span><i className="is-meeting" />On the calendar</span>
          </div>
        </div>
      </section>

      <footer>
        Blocks come from <span className="mono">os_plan.js</span>. Meetings are read from Google
        Calendar; to-dos push out as Google Tasks so the two stay filterable apart.
      </footer>
    </div>
  );
}
