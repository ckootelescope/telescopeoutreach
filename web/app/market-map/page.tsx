import { db } from '@/lib/supabase';
import { Nav } from '../nav';
import { ViewWrapper } from './view-wrapper';
import type { Sector, Company } from './tree';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MarketMap() {
  const s = db();

  const [sectorsRes, companiesRes, linksRes] = await Promise.all([
    s.from('market_sector').select('*').order('sort_order'),
    s.from('market_company').select('*').order('name'),
    s.from('market_company_sector').select('*'),
  ]);

  const sectors = (sectorsRes.data ?? []) as Sector[];

  const links = (linksRes.data ?? []) as { company_id: number; sector_id: number }[];
  const sectorsByCompany = new Map<number, number[]>();
  for (const l of links) {
    if (!sectorsByCompany.has(l.company_id)) sectorsByCompany.set(l.company_id, []);
    sectorsByCompany.get(l.company_id)!.push(l.sector_id);
  }

  const companies: Company[] = ((companiesRes.data ?? []) as any[]).map(r => ({
    ...r,
    sectors: sectorsByCompany.get(r.id) ?? [],
  }));

  const roots = sectors.filter(s => !s.parent_id).length;
  const leaves = sectors.filter(s => !sectors.some(o => o.parent_id === s.id)).length;

  return (
    <div className="wrap">
      <Nav current="/market-map" />

      <div className="kpis">
        <div className="kpi">
          <div className="k">Verticals</div><div className="v">{roots}</div>
          <div className="s">top-level markets</div>
        </div>
        <div className="kpi">
          <div className="k">Sectors</div><div className="v">{sectors.length}</div>
          <div className="s">all levels</div>
        </div>
        <div className="kpi">
          <div className="k">Companies</div><div className="v">{companies.length}</div>
          <div className="s">tracked</div>
        </div>
        <div className="kpi">
          <div className="k">Categories</div><div className="v">{leaves}</div>
          <div className="s">leaf segments</div>
        </div>
      </div>

      <ViewWrapper sectors={sectors} companies={companies} />

      <footer>
        Map view for browsing, List view for editing. Click a sector in Map to see its companies.
      </footer>
    </div>
  );
}
