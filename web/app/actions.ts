'use server';

import { db } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

/**
 * Every write the console can make. Server actions rather than API routes so
 * each control is a plain form and the page still works with JavaScript off.
 *
 * Both paths are revalidated because the same task appears on the dashboard and
 * in the week side panel, and a stale count on the other tab reads as a bug.
 */
function refresh() {
  revalidatePath('/dashboard');
  revalidatePath('/week');
  revalidatePath('/investors');
}

export async function toggleTask(formData: FormData) {
  const id = Number(formData.get('id'));
  const to = String(formData.get('to') || 'done');
  if (!id) return;

  await db().from('os_task').update({ status: to === 'done' ? 'done' : 'open' }).eq('id', id);
  refresh();
}

export async function toggleBigThing(formData: FormData) {
  const id = Number(formData.get('id'));
  const to = String(formData.get('to') || 'done');
  if (!id) return;

  await db().from('os_big_three').update({ status: to === 'done' ? 'done' : 'open' }).eq('id', id);
  refresh();
}

/**
 * Meetings get rescheduled and cancelled, so they close like anything else.
 * status lives on os_calendar_event and is not part of the sync upsert, so a
 * calendar refresh cannot undo this.
 */
export async function toggleMeeting(formData: FormData) {
  const id = String(formData.get('id') || '');
  const to = String(formData.get('to') || 'done');
  if (!id) return;

  await db().from('os_calendar_event')
    .update({ status: to === 'done' ? 'done' : 'scheduled' })
    .eq('external_id', id);
  refresh();
}

/**
 * Reorder within a day by swapping sort with the neighbour above or below.
 *
 * A swap rather than a re-index: it touches two rows instead of all of them, and
 * it cannot renumber a task that another tab is halfway through editing.
 */
export async function moveTask(formData: FormData) {
  const id = Number(formData.get('id'));
  const dir = String(formData.get('dir'));
  if (!id || (dir !== 'up' && dir !== 'down')) return;

  const s = db();
  const { data: me } = await s.from('os_task').select('id,day,sort').eq('id', id).single();
  if (!me) return;

  const { data: siblings } = await s.from('os_task')
    .select('id,sort').eq('day', me.day).order('sort');
  if (!siblings) return;

  const i = siblings.findIndex((t: any) => t.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= siblings.length) return;

  const other = siblings[j];
  await s.from('os_task').update({ sort: other.sort }).eq('id', me.id);
  await s.from('os_task').update({ sort: me.sort }).eq('id', other.id);
  refresh();
}

export async function setTargetStatus(formData: FormData) {
  const id = Number(formData.get('id'));
  const to = String(formData.get('to') || 'sent');
  if (!id) return;

  await db().from('os_investor_target').update({ status: to }).eq('id', id);
  refresh();
}

/**
 * Inline edit on the Hard to Crack table. Only two fields are writable, and both
 * are Calvin's own words: the one-liner and what he did this week. Everything
 * else on that table comes from Affinity and would be overwritten by a re-sync.
 */
export async function updateHtc(formData: FormData) {
  const id = Number(formData.get('id'));
  const field = String(formData.get('field'));
  const value = String(formData.get('value') ?? '').trim();
  if (!id || !['one_liner', 'step_this_week', 'next_step'].includes(field)) return;

  await db().from('os_hard_to_crack').update({ [field]: value || null }).eq('id', id);
  revalidatePath('/hard-to-crack');
}

/** Park a company or put it back in play. A hold is a decision, not neglect. */
export async function setHtcMode(formData: FormData) {
  const id = Number(formData.get('id'));
  const mode = String(formData.get('mode'));
  if (!id || !['auto', 'manual', 'hold'].includes(mode)) return;

  await db().from('os_hard_to_crack').update({ cadence_mode: mode }).eq('id', id);
  revalidatePath('/hard-to-crack');
}
