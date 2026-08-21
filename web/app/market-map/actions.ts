'use server';

import { db } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

function refresh() {
  revalidatePath('/market-map');
}

export async function addSector(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const parentId = formData.get('parent_id') ? Number(formData.get('parent_id')) : null;
  if (!name) return;

  const s = db();
  const { data: siblings } = await s.from('market_sector')
    .select('sort_order')
    .is('parent_id', parentId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextSort = ((siblings?.[0]?.sort_order ?? -1) + 1);

  await s.from('market_sector').insert({
    name,
    parent_id: parentId,
    sort_order: nextSort,
  });
  refresh();
}

export async function renameSector(formData: FormData) {
  const id = Number(formData.get('id'));
  const name = String(formData.get('name') || '').trim();
  if (!id || !name) return;

  await db().from('market_sector').update({ name }).eq('id', id);
  refresh();
}

export async function deleteSector(formData: FormData) {
  const id = Number(formData.get('id'));
  if (!id) return;

  await db().from('market_sector').delete().eq('id', id);
  refresh();
}

export async function addCompany(formData: FormData) {
  const sectorId = Number(formData.get('sector_id'));
  const name = String(formData.get('name') || '').trim();
  const domain = String(formData.get('domain') || '').trim() || null;
  const description = String(formData.get('description') || '').trim() || null;
  const latestRound = String(formData.get('latest_round') || '').trim() || null;
  const roundAmount = String(formData.get('round_amount') || '').trim() || null;
  const notableInvestors = String(formData.get('notable_investors') || '').trim() || null;
  const arr = String(formData.get('arr') || '').trim() || null;
  const arrGrowth = String(formData.get('arr_growth') || '').trim() || null;
  const headcount = formData.get('headcount') ? Number(formData.get('headcount')) : null;
  const note = String(formData.get('note') || '').trim() || null;
  if (!sectorId || !name) return;

  const s = db();
  const { data } = await s.from('market_company').insert({
    name, domain, description, latest_round: latestRound, round_amount: roundAmount,
    notable_investors: notableInvestors, arr, arr_growth: arrGrowth,
    headcount, note,
  }).select('id').single();

  if (data) {
    await s.from('market_company_sector').insert({
      company_id: data.id,
      sector_id: sectorId,
    });
  }
  refresh();
}

export async function updateCompany(formData: FormData) {
  const id = Number(formData.get('id'));
  const field = String(formData.get('field'));
  const value = String(formData.get('value') ?? '').trim();
  if (!id) return;

  const allowed = [
    'name', 'domain', 'description', 'latest_round', 'round_amount',
    'notable_investors', 'arr', 'arr_growth', 'headcount', 'note',
  ];
  if (!allowed.includes(field)) return;

  const val = field === 'headcount'
    ? (value ? Number(value) : null)
    : (value || null);

  await db().from('market_company').update({ [field]: val, updated_at: new Date().toISOString() }).eq('id', id);
  refresh();
}

export async function deleteCompany(formData: FormData) {
  const id = Number(formData.get('id'));
  if (!id) return;

  await db().from('market_company').delete().eq('id', id);
  refresh();
}

export async function moveSector(formData: FormData) {
  const id = Number(formData.get('id'));
  const dir = String(formData.get('dir'));
  if (!id || (dir !== 'up' && dir !== 'down')) return;

  const s = db();
  const { data: me } = await s.from('market_sector').select('id,parent_id,sort_order').eq('id', id).single();
  if (!me) return;

  const q = s.from('market_sector').select('id,sort_order').order('sort_order');
  const { data: siblings } = me.parent_id
    ? await q.eq('parent_id', me.parent_id)
    : await q.is('parent_id', null);
  if (!siblings) return;

  const i = siblings.findIndex((r: any) => r.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= siblings.length) return;

  const other = siblings[j];
  await s.from('market_sector').update({ sort_order: other.sort_order }).eq('id', me.id);
  await s.from('market_sector').update({ sort_order: me.sort_order }).eq('id', other.id);
  refresh();
}
