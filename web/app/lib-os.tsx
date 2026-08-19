import { toggleTask, toggleMeeting, moveTask } from './actions';

/** The five call labels Calvin keeps in Google Calendar, plus a catch-all. */
export const LABEL: Record<string, string> = {
  company: 'Company',
  investor: 'Investor',
  expert: 'Expert',
  reference: 'Reference',
  internal: 'Internal',
  other: 'Other',
};

export type Task = {
  id: number; title: string; notes: string | null; stream: string; subject: string | null;
  day: string; start_min: number | null; end_min: number | null; status: string;
  origin: string; sort: number;
};

export type Meeting = {
  external_id: string; summary: string; starts_at: string; ends_at: string | null; day: string;
  status: string; time_label: string | null; category: string; deal: string | null;
  org: string | null; counterpart: string | null; title: string | null;
  one_liner: string | null; focus: string | null; conversation_type: string;
  firm: string | null; invests_in: string | null; track: string[] | null;
};

export const clock = (min: number) => {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ap = h24 >= 12 && h24 < 24 ? 'pm' : 'am';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, '0')}${ap}`;
};

/** "1h 15m". Duration is what makes a block legible without making it bigger. */
export const dur = (a: number, b: number) => {
  const n = b - a;
  const h = Math.floor(n / 60), m = n % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

export function ptMinutes(ts: string) {
  const s = new Date(ts).toLocaleTimeString('en-GB', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/**
 * One row of work. The time gutter carries start, end and duration stacked, so
 * the block a task occupies reads at a glance without the row growing.
 */
export function TaskRow({ t, reorder = false }: { t: Task; reorder?: boolean }) {
  const done = t.status === 'done';
  return (
    <div className={`row s-${t.stream}${done ? ' is-done' : ''}`}>
      <span className="slot">
        {t.start_min !== null ? (
          <>
            <b>{clock(t.start_min)}</b>
            {t.end_min !== null && <i>{clock(t.end_min)}</i>}
            {t.end_min !== null && <u>{dur(t.start_min, t.end_min)}</u>}
          </>
        ) : (
          <b className="notime">no time</b>
        )}
      </span>
      <span className="body">
        <span className="head">
          {t.subject && <b>{t.subject}</b>}
          {t.title}
        </span>
        {t.notes && <span className="why">{t.notes}</span>}
        {t.origin !== 'calvin' && (
          <span className="tag">{t.origin === 'expanded' ? 'expanded' : 'you asked for this'}</span>
        )}
      </span>
      {reorder && (
        <span className="nudge">
          <form action={moveTask}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="dir" value="up" />
            <button type="submit" title="Move up">↑</button>
          </form>
          <form action={moveTask}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="dir" value="down" />
            <button type="submit" title="Move down">↓</button>
          </form>
        </span>
      )}
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

/** A meeting in a day list. Closable, because meetings move. */
export function MeetingRow({ m }: { m: Meeting }) {
  const done = m.status === 'done';
  const a = ptMinutes(m.starts_at);
  const b = m.ends_at ? ptMinutes(m.ends_at) : null;
  return (
    <div className={`row is-meeting c-${m.category}${done ? ' is-done' : ''}`}>
      <span className="slot">
        <b>{clock(a)}</b>
        {b !== null && <i>{clock(b)}</i>}
        {b !== null && <u>{dur(a, b)}</u>}
      </span>
      <span className="body">
        <span className="head">
          {m.org ?? m.summary}
          {m.counterpart && m.counterpart !== m.org && <em> · {m.counterpart}</em>}
        </span>
        <span className="labels">
          <span className={`lab c-${m.category}`}>{LABEL[m.category] ?? m.category}</span>
          {m.deal && <span className="lab deal">{m.deal}</span>}
        </span>
      </span>
      <form action={toggleMeeting}>
        <input type="hidden" name="id" value={m.external_id} />
        <input type="hidden" name="to" value={done ? 'scheduled' : 'done'} />
        <button className="box" type="submit" aria-label={done ? 'Reopen' : 'Mark held'}>
          {done ? '✓' : ''}
        </button>
      </form>
    </div>
  );
}
