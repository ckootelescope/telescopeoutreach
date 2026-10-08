import { db } from '@/lib/supabase';
import { Nav } from '../nav';
import { setFeedItem } from '../actions';
import { ptMinutes } from '../lib-os';
import { CopyButton } from './copy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * The command center. Three things, in the order Calvin uses them in the
 * morning, and nothing else:
 *
 *   1. Call prep        Daily Call Prep task, 6:41am weekdays
 *   2. Break-In queue   Daily Break-In List task, 6:52am weekdays
 *   3. HTC escalations  HTC Escalation task, 8:52am Tue and Thu
 *
 * Each task does its research in a claude.ai session and writes one row to
 * os_daily_feed (db/os11.sql). This page only renders the latest row of each
 * kind. What he does with an item lives in os_feed_action, so a re-run never
 * wipes a check mark.
 */

const SHEET = 'https://docs.google.com/spreadsheets/d/1-cjKaFsrXyUjUmZbKcEKr4g9u8ATjVeY0kb8v23CvQk';
const AFFINITY = 'https://telescopepartners.affinity.co/companies/';

type Links = {
  website?: string; affinity?: string | number; linkedin?: string; harmonic?: string;
  granola?: string; calendar?: string; gmail?: string; meet?: string;
};

type CallItem = {
  key: string; time: string; name: string; type: string; who?: string;
  what?: string; where_it_sits?: string; last_time?: string; focus?: string[];
  starts_at?: string; links?: Links;
};

type BreakInItem = {
  key: string; group: 'priority' | 'other'; company: string; website?: string;
  last_touch?: string | null; days_since?: number | null; replied?: boolean;
  live_cadence?: string | null; next_step: string; next_step_type?: string; why?: string;
  links?: Links;
};

type HtcItem = {
  key: string; company: string; website?: string; priority?: boolean;
  emails?: number; cadences?: number; last_touch?: string | null;
  route_type?: string; route: string; draft: string; links?: Links;
};

type Feed<T> = {
  kind: string; for_date: string; items: T[]; summary: Record<string, any>;
  generated_at: string;
} | null;

const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const nowMinPT = () => ptMinutes(new Date().toISOString());

const shortDate = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC',
  });

const longDate = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });

const stamp = (ts: string) =>
  new Date(ts).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  }).toLowerCase().replace(' ', '');

const host = (u?: string) => (u ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
const href = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);

/** "9:30am" or "9:30 AM" to minutes after midnight, for past/upcoming split. */
function clockMin(t: string): number | null {
  const m = t.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3] === 'pm') h += 12;
  if (!m[3] && Number(m[1]) < 7) h += 12;
  return h * 60 + Number(m[2] ?? 0);
}

function LinkRow({ l, domain, gmail = true }: { l?: Links; domain?: string; gmail?: boolean }) {
  const d = host(domain ?? l?.website);
  const out: { label: string; url: string }[] = [];
  if (l?.meet) out.push({ label: 'Join', url: l.meet });
  if (d) out.push({ label: d, url: href(l?.website ?? d) });
  if (l?.affinity) out.push({
    label: 'Affinity',
    url: String(l.affinity).startsWith('http') ? String(l.affinity) : AFFINITY + l.affinity,
  });
  if (l?.harmonic) out.push({ label: 'Harmonic', url: l.harmonic });
  if (l?.linkedin) out.push({ label: 'LinkedIn', url: l.linkedin });
  if (l?.granola) out.push({ label: 'Last notes', url: l.granola });
  if (gmail && (l?.gmail || d)) out.push({
    label: 'Gmail',
    url: l?.gmail ?? `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(d)}`,
  });
  if (l?.calendar) out.push({ label: 'Event', url: l.calendar });
  if (!out.length) return null;
  return (
    <div className="flinks">
      {out.map((x) => (
        <a key={x.label + x.url} href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a>
      ))}
    </div>
  );
}

function Toggle({
  kind, forDate, k, status, to, label, doneLabel,
}: {
  kind: string; forDate: string; k: string; status?: string;
  to: 'done' | 'skipped'; label: string; doneLabel: string;
}) {
  const on = status === to;
  return (
    <form action={setFeedItem}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="for_date" value={forDate} />
      <input type="hidden" name="key" value={k} />
      <input type="hidden" name="to" value={on ? 'clear' : to} />
      <button type="submit" className={`fbtn${on ? ' on' : ''}`}>{on ? doneLabel : label}</button>
    </form>
  );
}

function Stale({ feed, today, every }: { feed: Feed<any>; today: string; every: string }) {
  if (!feed) return <p className="note warn-txt">No run has landed yet. Runs {every}.</p>;
  if (feed.for_date === today) return null;
  return <p className="note warn-txt">Showing {shortDate(feed.for_date)}. Today&apos;s run has not landed yet ({every}).</p>;
}

export default async function Dashboard() {
  const s = db();
  const today = todayPT();

  const [{ data: feeds }, { data: acts }] = await Promise.all([
    s.from('v_os_feed_latest').select('*'),
    s.from('os_feed_action').select('kind,for_date,item_key,status').gte('for_date',
      new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10)),
  ]);

  const get = (k: string) => ((feeds ?? []) as any[]).find((f) => f.kind === k) ?? null;
  const calls = get('call_prep') as Feed<CallItem>;
  const breakIn = get('break_in') as Feed<BreakInItem>;
  const htc = get('htc') as Feed<HtcItem>;

  const act = (kind: string, forDate: string, key: string) =>
    ((acts ?? []) as any[]).find((a) => a.kind === kind && a.for_date === forDate && a.item_key === key)?.status as
      string | undefined;

  // ---- 1. calls -----------------------------------------------------------
  const callItems = calls?.for_date === today ? calls.items : (calls?.items ?? []);
  const nowMin = nowMinPT();
  const callsToday = calls?.for_date === today;
  const nextIdx = callsToday
    ? callItems.findIndex((c) => (c.starts_at ? ptMinutes(c.starts_at) : clockMin(c.time) ?? 0) >= nowMin - 15)
    : -1;

  // ---- 2. break-in --------------------------------------------------------
  const biItems = breakIn?.items ?? [];
  const biState = (b: BreakInItem) => (breakIn ? act('break_in', breakIn.for_date, b.key) : undefined);
  const biOpen = biItems.filter((b) => !biState(b)).length;
  const groups: { label: string; rows: BreakInItem[] }[] = [
    { label: 'Priority', rows: biItems.filter((b) => b.group === 'priority') },
    { label: 'Non-priority', rows: biItems.filter((b) => b.group !== 'priority') },
  ];

  // ---- 3. htc -------------------------------------------------------------
  const htcItems = htc?.items ?? [];
  const htcState = (h: HtcItem) => (htc ? act('htc', htc.for_date, h.key) : undefined);
  const htcOpen = htcItems.filter((h) => !htcState(h)).length;

  return (
    <div className="wrap">
      <Nav current="/dashboard" />

      <div className="cc-head">
        <div className="cc-date">{longDate(today)}</div>
        <div className="cc-sum mono">
          <span><b>{callsToday ? callItems.length : 0}</b> calls</span>
          <span><b>{biOpen}</b> to break in</span>
          <span className={htcOpen ? 'warn-txt' : ''}><b>{htcOpen}</b> to escalate</span>
        </div>
      </div>

      {/* 1. Call prep ---------------------------------------------------- */}
      <section>
        <h2>
          Call prep
          <span className="count">
            {callsToday ? `${callItems.length} today` : calls ? shortDate(calls.for_date) : ''}
          </span>
          {calls && <span className="gen">{stamp(calls.generated_at)}</span>}
        </h2>
        <Stale feed={calls} today={today} every="6:41am weekdays" />
        {calls && callItems.length === 0 ? (
          <div className="panel"><div className="empty">No external calls today.</div></div>
        ) : (
          <div className="calls">
            {callItems.map((c, i) => {
              const past = callsToday && nextIdx !== -1 ? i < nextIdx : callsToday && nextIdx === -1;
              const next = i === nextIdx;
              return (
                <article key={c.key}
                  className={`call t-${c.type}${past ? ' is-past' : ''}${next ? ' is-next' : ''}`}>
                  <div className="call-time mono">
                    <b>{c.time}</b>
                    <span className="lab">{c.type}</span>
                    {next && <span className="next">next</span>}
                  </div>
                  <div className="call-body">
                    <div className="call-name">
                      {c.name}
                      {c.who && <em>{c.who}</em>}
                    </div>
                    {c.what && <p className="call-what">{c.what}</p>}
                    <dl>
                      {c.where_it_sits && <><dt>Sits</dt><dd>{c.where_it_sits}</dd></>}
                      <dt>Last time</dt><dd>{c.last_time || 'First meeting'}</dd>
                    </dl>
                    {c.focus && c.focus.length > 0 && (
                      <ul className="focus-list">
                        {c.focus.map((f, j) => <li key={j}>{f}</li>)}
                      </ul>
                    )}
                    <LinkRow l={c.links} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Break-In queue ------------------------------------------------ */}
      <section>
        <h2>
          Break-In queue
          <span className="count">{biOpen} of {biItems.length} open</span>
          {breakIn && <span className="gen">{stamp(breakIn.generated_at)}</span>}
        </h2>
        <Stale feed={breakIn} today={today} every="6:52am weekdays" />
        {breakIn && (
          <div className="panel">
            {groups.map((g) => g.rows.length > 0 && (
              <div key={g.label}>
                <div className="rowbreak"><span>{g.label}</span></div>
                {g.rows.map((b) => {
                  const st = biState(b);
                  return (
                    <div className={`bi${st ? ' is-' + st : ''}`} key={b.key}>
                      <div className="bi-co">
                        <span className="bi-name">{b.company}</span>
                        <LinkRow l={{ ...b.links, website: b.website ?? b.links?.website }} />
                      </div>
                      <div className="bi-touch mono">
                        <b className={(b.days_since ?? 999) >= 45 ? 'stop-txt' : ''}>
                          {b.days_since == null ? 'never' : `${b.days_since}d`}
                        </b>
                        <span>{b.last_touch ?? 'no touch on record'}</span>
                        {b.replied
                          ? <span className="pill ok">replied before</span>
                          : <span className="pill">never replied</span>}
                        {b.live_cadence && <span className="pill r1">{b.live_cadence}</span>}
                      </div>
                      <div className="bi-next">
                        {b.next_step_type && <span className="lab">{b.next_step_type.replace(/_/g, ' ')}</span>}
                        <span>{b.next_step}</span>
                        {b.why && <em>{b.why}</em>}
                      </div>
                      <div className="bi-act">
                        <Toggle kind="break_in" forDate={breakIn.for_date} k={b.key} status={st}
                          to="done" label="Touched" doneLabel="✓ Touched" />
                        <Toggle kind="break_in" forDate={breakIn.for_date} k={b.key} status={st}
                          to="skipped" label="Skip" doneLabel="Skipped" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {biItems.length === 0 && <div className="empty">Nothing in the queue.</div>}
          </div>
        )}
        {breakIn && (
          <p className="note">
            {breakIn.summary?.untouched_45 != null &&
              <><b className="stop-txt">{breakIn.summary.untouched_45}</b> CK Break-In companies untouched 45+ days. </>}
            <a href={SHEET} target="_blank" rel="noopener noreferrer">Open the Break-In tab</a>
          </p>
        )}
        {breakIn?.summary?.flags?.length > 0 && (
          <p className="note warn-txt">Flags: {(breakIn!.summary.flags as string[]).join(' · ')}</p>
        )}
      </section>

      {/* 3. HTC escalations ----------------------------------------------- */}
      <section>
        <h2>
          Escalate
          <span className="count">
            {htc ? `${htcOpen} open · as of ${shortDate(htc.for_date)}` : ''}
          </span>
        </h2>
        {!htc && <p className="note warn-txt">No run has landed yet. Runs 8:52am Tue and Thu.</p>}
        {htc && htcItems.length === 0 && (
          <div className="panel"><div className="empty">No new escalations.</div></div>
        )}
        {htcItems.length > 0 && (
          <div className="escs">
            {htcItems.map((h) => {
              const st = htcState(h);
              return (
                <article className={`esc${st ? ' is-' + st : ''}`} key={h.key}>
                  <div className="esc-head">
                    <span className="esc-name">{h.company}</span>
                    {h.priority && <span className="pill stop">priority</span>}
                    <span className="mono dim">
                      {h.emails ?? '?'} emails · {h.cadences ?? '?'} cadence{h.cadences === 1 ? '' : 's'}
                      {h.last_touch && ` · last ${h.last_touch}`}
                    </span>
                  </div>
                  <div className="esc-route">
                    {h.route_type && <span className="lab">{h.route_type.replace(/_/g, ' ')}</span>}
                    <span>{h.route}</span>
                  </div>
                  <blockquote className="esc-draft">{h.draft}</blockquote>
                  <div className="esc-foot">
                    <LinkRow l={{ ...h.links, website: h.website ?? h.links?.website }} />
                    <div className="bi-act">
                      <CopyButton text={h.draft} />
                      <Toggle kind="htc" forDate={htc!.for_date} k={h.key} status={st}
                        to="done" label="Posted" doneLabel="✓ Posted" />
                      <Toggle kind="htc" forDate={htc!.for_date} k={h.key} status={st}
                        to="skipped" label="Not now" doneLabel="Skipped" />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {htc?.summary?.more_tapped_out > 0 && (
          <p className="note">{htc!.summary.more_tapped_out} more CK Break-In companies are tapped out.</p>
        )}
      </section>

      <footer>
        Written each morning by the Daily Call Prep, Daily Break-In List and HTC Escalation
        scheduled tasks into <span className="mono">os_daily_feed</span>.
      </footer>
    </div>
  );
}
