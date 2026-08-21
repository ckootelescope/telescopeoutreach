'use client';

import { useState } from 'react';
import { MarketTree, type Sector, type Company } from './tree';
import { MapView } from './map-view';

export function ViewWrapper({ sectors, companies }: { sectors: Sector[]; companies: Company[] }) {
  const [view, setView] = useState<'map' | 'list'>('map');

  return (
    <>
      <div className="mm-view-toggle">
        <button type="button" onClick={() => setView('map')}
          className={view === 'map' ? 'on' : ''}>Map</button>
        <button type="button" onClick={() => setView('list')}
          className={view === 'list' ? 'on' : ''}>List</button>
      </div>
      {view === 'map'
        ? <MapView sectors={sectors} companies={companies} />
        : <MarketTree sectors={sectors} companies={companies} />}
    </>
  );
}
