import { db } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const STREAMS = ['diligence', 'sourcing', 'investor', 'market', 'learning'] as const;

/**
 * The planner.
 *
 * The model never sees a database connection and never writes SQL. It gets a
 * fixed read bundle assembled below and a closed set of five write tools. The
 * service role key bypasses row level security on every founder email in the
 * database, so the blast radius of a bad generation has to be bounded by the
 * tool surface rather than by the prompt.
 */

const TOOLS = [
  {
    name: 'add_task',
    description:
      'Create one to-do. Only for work Calvin stated, work fanned out from what he stated, ' +
      'or a suggestion he explicitly asked for. Never invent work.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The action, imperative, no company prefix.' },
        stream: { type: 'string', enum: STREAMS as unknown as string[] },
        subject: { type: 'string', description: 'Company, market or person this belongs to. Omit if none.' },
        subject_kind: { type: 'string', enum: ['company', 'market', 'person', 'none'] },
        day: { type: 'string', description: 'YYYY-MM-DD. Omit for a weekly item with no day.' },
        due_on: { type: 'string', description: 'YYYY-MM-DD, for anything anchored beyond this week.' },
        notes: { type: 'string', description: 'Why it landed here. One short sentence.' },
        calendar_ref: { type: 'string', description: 'external_id of the event it is anchored to.' },
        origin: {
          type: 'string',
          enum: ['calvin', 'expanded', 'asked_for'],
          description: 'calvin = he said it. expanded = fanned out from what he said. ' +
            'asked_for = he asked you to suggest it.',
        },
      },
      required: ['title', 'stream'],
    },
  },
  {
    name: 'set_status',
    description: 'Mark a task done or reopen it.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        status: { type: 'string', enum: ['open', 'done'] },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'reschedule',
    description:
      'Move a task to another day, or off the day entirely. Pass day as null to make it a ' +
      'weekly item. Pass off_week true to push it out of the week; it keeps its subject.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        day: { type: ['string', 'null'] },
        off_week: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'drop_task',
    description: 'Drop a task Calvin no longer wants. Prefer reschedule when it is only delayed.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
    },
  },
  {
    name: 'set_priority',
    description:
      'Replace the declared priority order. Only when Calvin states an order. Rank 1 is top. ' +
      'kind stream is valid, e.g. sourcing ranked above everything except one company.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rank: { type: 'integer' },
              label: { type: 'string' },
              kind: { type: 'string', enum: ['company', 'market', 'stream'] },
              stream: { type: 'string', enum: STREAMS as unknown as string[] },
              note: { type: 'string' },
            },
            required: ['rank', 'label', 'kind'],
          },
        },
      },
      required: ['items'],
    },
  },
] as const;

const SYSTEM = `You maintain Calvin Koo's weekly plan. He is an Associate at Telescope Partners, a $275M Series A fund.

Your job is to turn what he says into to-dos and place them on days. You do not decide what he works on.

Rules, in order of importance:

1. Never invent work. If he did not say it, it does not become a task. No filler, no "you should also".
2. Honor self-corrections. "get calls scheduled although I think I have a lot this week so mainly build the list" is ONE task (build the list) plus a note that scheduling was deferred. Not two tasks.
3. Fan out only where the data decides the list, not you. "Send all the relevant follow-ups" becomes one task per the follow-ups already due, origin "expanded". "An action for each hard to crack company" is one task, origin "expanded", unless he asks for it split out.
4. Suggestions are pull, not push. Only propose things when he asks ("feed me some investors"). Then origin is "asked_for". Never volunteer.
5. Respect his declared priority order. Higher priority work gets the better blocks. He sets the order; you never reorder it yourself.
6. Place around the calendar, never on top of it. A day already carrying several calls gets fewer to-dos. Long reading and modeling go in the longest clear stretch. Anchor a task to a related meeting with calendar_ref and say so in notes. If he travels in the evening, the next day is light.
7. Undated is fine. A real commitment with no natural day is a weekly item: omit day. Anything anchored past this week gets due_on and no day.
8. Notes earn their place. One short sentence on why it landed there, especially when the calendar drove it. Otherwise omit.

Writing style: plain, direct, lowercase-ish task titles in the imperative. No em dashes. No flattery. No jargon.

When you are done writing tasks, reply in at most four sentences: what you placed, anything you deliberately did not create, and any conflict you saw in the calendar. Do not list every task back; he can see the grid.`;

// ---------------------------------------------------------------------------

type Tool = { id: string; name: string; input: any };

async function runTool(t: Tool, weekId: number | null) {
  const s = db();
  const i = t.input ?? {};

  switch (t.name) {
    case 'add_task': {
      const kind = i.subject_kind ?? (i.subject ? 'company' : 'none');
      let company_id: number | null = null;
      let market_id: number | null = null;

      if (i.subject && kind === 'company') {
        const { data } = await s.from('company').select('id').ilike('name', i.subject).limit(1);
        company_id = data?.[0]?.id ?? null;
      }
      if (i.subject && kind === 'market') {
        const { data } = await s.from('os_market').select('id').ilike('name', i.subject).limit(1);
        market_id = data?.[0]?.id
          ?? (await s.from('os_market').insert({ name: i.subject }).select('id').single()).data?.id
          ?? null;
      }

      const { data, error } = await s.from('os_task').insert({
        title: i.title,
        notes: i.notes ?? null,
        stream: i.stream,
        subject_kind: kind,
        subject_label: i.subject ?? null,
        company_id, market_id,
        week_id: weekId,
        day: i.day ?? null,
        due_on: i.due_on ?? null,
        calendar_ref: i.calendar_ref ?? null,
        origin: i.origin ?? 'calvin',
      }).select('id').single();

      if (error) return { error: error.message };
      return { ok: true, id: data?.id };
    }

    case 'set_status': {
      const { error } = await s.from('os_task').update({ status: i.status }).eq('id', i.id);
      return error ? { error: error.message } : { ok: true };
    }

    case 'reschedule': {
      const patch: Record<string, unknown> = { day: i.day ?? null };
      if (i.off_week) { patch.week_id = null; patch.day = null; }
      const { error } = await s.from('os_task').update(patch).eq('id', i.id);
      return error ? { error: error.message } : { ok: true };
    }

    case 'drop_task': {
      const { error } = await s.from('os_task').update({ status: 'dropped' }).eq('id', i.id);
      return error ? { error: error.message } : { ok: true };
    }

    case 'set_priority': {
      // Deactivate first: the unique rank index only applies to active rows.
      await s.from('os_priority').update({ active: false }).eq('active', true);
      const rows = (i.items ?? []).map((x: any) => ({
        rank: x.rank, label: x.label, kind: x.kind,
        stream: x.stream ?? null, note: x.note ?? null, active: true,
      }));
      const { error } = await s.from('os_priority').insert(rows);
      return error ? { error: error.message } : { ok: true, n: rows.length };
    }

    default:
      return { error: `unknown tool ${t.name}` };
  }
}

/** Monday of the Pacific week containing today. */
function thisMonday() {
  const pt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pt.setHours(12, 0, 0, 0);
  pt.setDate(pt.getDate() - ((pt.getDay() + 6) % 7));
  return pt.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set. Add it in Vercel, then redeploy.' },
      { status: 503 },
    );
  }

  const { message, weekOf } = await req.json().catch(() => ({}));
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'No message.' }, { status: 400 });
  }

  const s = db();
  const targetWeek = weekOf || thisMonday();

  // Find or open the week.
  let { data: week } = await s.from('os_week').select('*').eq('week_of', targetWeek).maybeSingle();
  if (!week) {
    const ins = await s.from('os_week')
      .insert({ week_of: targetWeek, status: 'active', intent: message })
      .select('*').single();
    week = ins.data;
  } else if (!week.intent) {
    await s.from('os_week').update({ intent: message }).eq('id', week.id);
  }
  const weekId = week?.id ?? null;

  const weekEnd = new Date(Date.parse(targetWeek + 'T12:00:00Z') + 4 * 864e5)
    .toISOString().slice(0, 10);

  // The read bundle. Fixed shape, assembled here, never chosen by the model.
  const [tasks, events, prio, markets, due, unsent, waiting, htc] = await Promise.all([
    s.from('v_os_task').select('id,title,stream,subject,day,due_on,status,origin,notes')
      .eq('week_id', weekId ?? -1).order('sort'),
    s.from('os_calendar_event').select('external_id,summary,starts_at,day')
      .gte('day', targetWeek).lte('day', weekEnd).order('starts_at'),
    s.from('v_os_priority').select('rank,display,kind,stream,note'),
    s.from('os_market').select('name,status'),
    s.from('dash_due').select('company,step_no,due_date,kind'),
    s.from('dash_drafted_not_sent').select('company,step_no,drafted_on'),
    s.from('v_awaiting_reply').select('company').limit(50),
    s.from('v_os_backlog').select('id,title,subject,stream'),
  ]);

  const context = {
    today_pacific: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }),
    week_of: targetWeek,
    days: [0, 1, 2, 3, 4].map((n) => {
      const d = new Date(Date.parse(targetWeek + 'T12:00:00Z') + n * 864e5);
      return { day: d.toISOString().slice(0, 10), name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][n] };
    }),
    declared_priority_order: prio.data ?? [],
    calendar_this_week: (events.data ?? []).map((e: any) => ({
      id: e.external_id, day: e.day, summary: e.summary,
      time: new Date(e.starts_at).toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit',
      }),
    })),
    tasks_already_on_this_week: tasks.data ?? [],
    carry_over_backlog: htc.data ?? [],
    open_markets: markets.data ?? [],
    outreach: {
      follow_ups_due: due.data ?? [],
      drafted_not_sent: unsent.data ?? [],
      awaiting_reply_count: (waiting.data ?? []).length,
    },
  };

  const messages: any[] = [
    {
      role: 'user',
      content:
        `Current state:\n\`\`\`json\n${JSON.stringify(context, null, 1)}\n\`\`\`\n\n` +
        `Calvin says:\n${message}`,
    },
  ];

  const actions: { name: string; input: any; result: any }[] = [];
  let text = '';

  // Tool loop. Bounded: a runaway generation must not be able to write forever.
  for (let turn = 0; turn < 8; turn++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM,
        tools: TOOLS,
        messages,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Anthropic API ${res.status}: ${detail.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const body = await res.json();
    const blocks = body.content ?? [];
    text = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();

    const calls: Tool[] = blocks.filter((b: any) => b.type === 'tool_use');
    if (calls.length === 0) break;

    messages.push({ role: 'assistant', content: blocks });

    const results = [];
    for (const call of calls) {
      const result = await runTool(call, weekId);
      actions.push({ name: call.name, input: call.input, result });
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(result),
        ...(result && (result as any).error ? { is_error: true } : {}),
      });
    }
    messages.push({ role: 'user', content: results });
  }

  if (weekId) {
    await s.from('os_message').insert([
      { week_id: weekId, role: 'calvin', content: message },
      { week_id: weekId, role: 'system', content: text || '(no reply)', actions_taken: actions },
    ]);
  }

  return NextResponse.json({
    reply: text,
    wrote: actions.length,
    errors: actions.filter((a) => a.result?.error).map((a) => a.result.error),
  });
}
