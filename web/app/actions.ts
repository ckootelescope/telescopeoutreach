'use server';

import { db } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

/**
 * Checking something off. A server action rather than an API route so each row
 * can be a plain form and the page still works with JavaScript off.
 *
 * Both paths are revalidated because the same task shows on the dashboard and
 * in the week calendar, and a stale count on the other tab reads as a bug.
 */
function refresh() {
  revalidatePath('/dashboard');
  revalidatePath('/week');
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
