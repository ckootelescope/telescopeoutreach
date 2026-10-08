import { db } from '@/lib/supabase';
import { Nav } from '../nav';
import { togglePodcast } from '../actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Podcasts to listen to. A queue, not a task list: no day, no due date, just an
 * order and a mark once it has been heard. Listened episodes stay visible below
 * so "did I already hear that one" has an answer.
 */
type Row = {
  id: number; title: string; show: string | null; guest: string | null; url: string;
  notes: string | null; status: string; listened_at: string | null;
};

export default async function Podcasts() {
  const { data } = await db().from('os_podcast').select('*')
    .order('sort').order('created_at');
  const rows = (data ?? []) as Row[];
  const queued = rows.filter((r) => r.status === 'queued');
  const heard = rows.filter((r) => r.status === 'listened')
    .sort((a, b) => (b.listened_at ?? '').localeCompare(a.listened_at ?? ''));

  return (
    <div className="wrap">
      <Nav current="/podcasts" />

      <section>
        <h2>Up next <span className="count">{queued.length}</span></h2>
        {queued.length === 0
          ? <p className="note">Nothing queued.</p>
          : <div className="panel"><Table rows={queued} /></div>}
      </section>

      {heard.length > 0 && (
        <section>
          <h2>Listened <span className="count">{heard.length}</span></h2>
          <div className="panel"><Table rows={heard} /></div>
        </section>
      )}
    </div>
  );
}

function Table({ rows }: { rows: Row[] }) {
  return (
    <table>
      <thead><tr><th>Episode</th><th>Show</th><th>Notes</th><th /></tr></thead>
      <tbody>
        {rows.map((p) => {
          const done = p.status === 'listened';
          return (
            <tr key={p.id}>
              <td className="co">
                <a href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a>
              </td>
              <td className="mono dim">{p.show ?? '—'}</td>
              <td className="mono dim">{p.notes ?? ''}</td>
              <td>
                <form action={togglePodcast}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="to" value={done ? 'queued' : 'listened'} />
                  <button type="submit">{done ? 'Undo' : 'Listened'}</button>
                </form>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
