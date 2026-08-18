'use server';

import { db } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

/**
 * Checking a box is the one write that should never need the model. It is a
 * server action rather than an API route so the row can be a plain form and the
 * page still works with JavaScript off.
 */
export async function toggleTask(formData: FormData) {
  const id = Number(formData.get('id'));
  const to = String(formData.get('to') || 'done');
  if (!id) return;

  await db()
    .from('os_task')
    .update({ status: to === 'done' ? 'done' : 'open' })
    .eq('id', id);

  revalidatePath('/week');
}

/** Move a task off the week without deleting it. It keeps its subject. */
export async function deferTask(formData: FormData) {
  const id = Number(formData.get('id'));
  if (!id) return;

  await db().from('os_task').update({ week_id: null, day: null }).eq('id', id);
  revalidatePath('/week');
}
