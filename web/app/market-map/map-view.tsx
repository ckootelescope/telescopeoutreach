'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import type { Sector, Company } from './tree';

/* ---------------------------------------------------------------------------
 * Web view.
 *
 * The old layout walked every leaf across a single horizontal cursor, so the
 * canvas grew without bound and the page scrolled sideways forever. This lays
 * the same data out radially instead: verticals on a ring, their sectors on an
 * arc in front of them, companies around the sector they belong to. The whole
 * thing is fitted to the viewBox, so it never scrolls, at any node count.
 *
 * A company linked to more than one sector is placed at the centroid of its
 * sectors, which drags cross-market companies into the middle and makes the
 * strands between verticals the visible part of the picture.
 * ------------------------------------------------------------------------- */

const PALETTE = [
  '#7B4DE0', '#00A44F', '#E23767', '#0093B5', '#C1691A', '#2E7D32',
  '#D81B60', '#00838F', '#5E35B1', '#F4511E', '#3949AB', '#00897B',
  '#8E24AA', '#43A047', '#E53935', '#1E88E5',
];

const R_VERT = 26;   // ring radius factor for verticals
const R_SECT = 15;
const R_CO = 9;

type Node = {
  id: string;
  kind: 'vertical' | 'sector' | 'company';
  label: string;
  x: number; y: number; r: number;
  color: string;
  vertical: number | null;      // root sector id
  refId: number;                // sector.id or company.id
  degree: number;
};

type Edge = { a: string; b: string; cross: boolean };

function rootOf(sectors: Map<number, Sector>, id: number): number {
  let cur = sectors.get(id);
  let guard = 0;
  while (cur && cur.parent_id && guard++ < 20) cur = sectors.get(cur.parent_id);
  return cur ? cur.id : id;
}

function pathOf(sectors: Map<number, Sector>, id: number): string {
  const parts: string[] = [];
  let cur = sectors.get(id);
  let guard = 0;
  while (cur && guard++ < 20) {
    parts.unshift(cur.name);
    cur = cur.parent_id ? sectors.get(cur.parent_id) : undefined;
  }
  return parts.join(' › ');
}

function buildGraph(sectors: Sector[], companies: Company[]) {
  const byId = new Map(sectors.map(s => [s.id, s]));
  const roots = sectors.filter(s => !s.parent_id);

  // Weight each vertical by how many companies hang off it, so crowded
  // markets get a proportionally wider slice of the ring.
  const weight = new Map<number, number>();
  for (const r of roots) weight.set(r.id, 1);
  for (const c of companies) {
    const seen = new Set<number>();
    for (const sid of c.sectors) {
      const rid = rootOf(byId, sid);
      if (!seen.has(rid)) { seen.add(rid); weight.set(rid, (weight.get(rid) ?? 0) + 1); }
    }
  }

  const colorOf = new Map<number, string>();
  roots.forEach((r, i) => colorOf.set(r.id, PALETTE[i % PALETTE.length]));

  const total = roots.reduce((s, r) => s + (weight.get(r.id) ?? 1), 0);
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];

  // --- verticals on the outer ring, arc-width proportional to weight -------
  let angle = -Math.PI / 2;
  const vertAngle = new Map<number, number>();
  const vertSpan = new Map<number, number>();
  for (const r of roots) {
    const span = ((weight.get(r.id) ?? 1) / total) * Math.PI * 2;
    const mid = angle + span / 2;
    vertAngle.set(r.id, mid);
    vertSpan.set(r.id, span);
    nodes.set(`s${r.id}`, {
      id: `s${r.id}`, kind: 'vertical', label: r.name,
      x: Math.cos(mid) * 620, y: Math.sin(mid) * 620,
      r: R_VERT, color: colorOf.get(r.id)!, vertical: r.id, refId: r.id, degree: 0,
    });
    angle += span;
  }

  // --- sectors on an inner arc in front of their vertical ------------------
  const descendants = new Map<number, Sector[]>();
  for (const s of sectors) {
    if (!s.parent_id) continue;
    const rid = rootOf(byId, s.id);
    if (!descendants.has(rid)) descendants.set(rid, []);
    descendants.get(rid)!.push(s);
  }

  for (const r of roots) {
    const kids = descendants.get(r.id) ?? [];
    const mid = vertAngle.get(r.id)!;
    const span = Math.min(vertSpan.get(r.id)! * 0.92, Math.PI * 0.5);
    kids.forEach((s, i) => {
      const t = kids.length === 1 ? 0 : (i / (kids.length - 1)) - 0.5;
      const a = mid + t * span;
      const depth = pathOf(byId, s.id).split(' › ').length;
      const rad = 430 - depth * 34;
      nodes.set(`s${s.id}`, {
        id: `s${s.id}`, kind: 'sector', label: s.name,
        x: Math.cos(a) * rad, y: Math.sin(a) * rad,
        r: R_SECT, color: colorOf.get(r.id)!, vertical: r.id, refId: s.id, degree: 0,
      });
      const parent = s.parent_id ? `s${s.parent_id}` : null;
      if (parent && nodes.has(parent)) edges.push({ a: parent, b: `s${s.id}`, cross: false });
    });
  }

  // --- companies at the centroid of every sector they sit in ---------------
  for (const c of companies) {
    const anchors = c.sectors.map(id => nodes.get(`s${id}`)).filter(Boolean) as Node[];
    if (!anchors.length) continue;
    const cx = anchors.reduce((s, n) => s + n.x, 0) / anchors.length;
    const cy = anchors.reduce((s, n) => s + n.y, 0) / anchors.length;
    // Nudge inward so companies sit between their sectors and the centre.
    const verts = new Set(anchors.map(a => a.vertical));
    const multi = verts.size > 1;
    const k = multi ? 0.72 : 0.86;
    nodes.set(`c${c.id}`, {
      id: `c${c.id}`, kind: 'company', label: c.name,
      x: cx * k, y: cy * k,
      r: R_CO, color: anchors[0].color, vertical: multi ? null : anchors[0].vertical,
      refId: c.id, degree: c.sectors.length,
    });
    for (const a of anchors) edges.push({ a: a.id, b: `c${c.id}`, cross: multi });
  }

  // --- relax overlaps ------------------------------------------------------
  const arr = [...nodes.values()];
  for (let pass = 0; pass < 90; pass++) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r + 8;
        const d2 = dx * dx + dy * dy;
        if (d2 > min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const ux = dx / d, uy = dy / d;
        // Verticals and sectors hold the frame; companies do most of the moving.
        const aw = a.kind === 'company' ? 1 : a.kind === 'sector' ? 0.35 : 0.1;
        const bw = b.kind === 'company' ? 1 : b.kind === 'sector' ? 0.35 : 0.1;
        const tot = aw + bw || 1;
        a.x -= ux * push * (aw / tot) * 2; a.y -= uy * push * (aw / tot) * 2;
        b.x += ux * push * (bw / tot) * 2; b.y += uy * push * (bw / tot) * 2;
      }
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adjacency.has(e.a)) adjacency.set(e.a, new Set());
    if (!adjacency.has(e.b)) adjacency.set(e.b, new Set());
    adjacency.get(e.a)!.add(e.b);
    adjacency.get(e.b)!.add(e.a);
  }

  const xs = arr.map(n => n.x), ys = arr.map(n => n.y);
  const pad = 90;
  const box = {
    x: Math.min(...xs) - pad, y: Math.min(...ys) - pad,
    w: Math.max(...xs) - Math.min(...xs) + pad * 2,
    h: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };

  return { nodes, edges, adjacency, box, roots, colorOf, byId };
}

export function MapView({ sectors, companies }: { sectors: Sector[]; companies: Company[] }) {
  const g = useMemo(() => buildGraph(sectors, companies), [sectors, companies]);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const coById = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const hit = new Set<string>();
    for (const n of g.nodes.values()) if (n.label.toLowerCase().includes(q)) hit.add(n.id);
    return hit;
  }, [q, g]);

  const focus = sel ?? hover;
  const near = focus ? g.adjacency.get(focus) ?? new Set<string>() : null;

  function dim(id: string) {
    if (matches) return !matches.has(id);
    if (!focus) return false;
    return id !== focus && !near!.has(id);
  }

  // Wheel zoom, pointer pan.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => Math.min(6, Math.max(0.55, z * (e.deltaY < 0 ? 1.12 : 0.89))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const vb = `${g.box.x + pan.x} ${g.box.y + pan.y} ${g.box.w / zoom} ${g.box.h / zoom}`;

  const selNode = sel ? g.nodes.get(sel) : null;
  const selCompany = selNode?.kind === 'company' ? coById.get(selNode.refId) : null;
  const selSector = selNode && selNode.kind !== 'company' ? g.byId.get(selNode.refId) : null;
  const sectorMembers = selSector
    ? companies.filter(c => c.sectors.includes(selSector.id))
    : [];

  return (
    <div className="mm-web">
      <div className="mm-web-bar">
        <input
          className="mm-web-search"
          placeholder="Find a company or sector..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="mm-web-hint">
          {matches
            ? `${matches.size} match${matches.size === 1 ? '' : 'es'}`
            : 'click a dot to trace its links · scroll to zoom · drag to pan'}
        </div>
        <button type="button" className="mm-btn dim"
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setSel(null); setQuery(''); }}>
          reset
        </button>
      </div>

      <div className="mm-web-body">
        <svg
          ref={svgRef}
          className="mm-web-svg"
          viewBox={vb}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={e => {
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
            (e.target as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={e => {
            if (!drag.current) return;
            const scale = g.box.w / zoom / (svgRef.current?.clientWidth || 1);
            setPan({
              x: drag.current.px - (e.clientX - drag.current.x) * scale,
              y: drag.current.py - (e.clientY - drag.current.y) * scale,
            });
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerLeave={() => { drag.current = null; setHover(null); }}
          onClick={e => { if (e.target === svgRef.current) setSel(null); }}
        >
          {/* edges under nodes */}
          <g>
            {g.edges.map((e, i) => {
              const a = g.nodes.get(e.a)!, b = g.nodes.get(e.b)!;
              if (!a || !b) return null;
              const lit = focus ? (e.a === focus || e.b === focus) : false;
              const off = focus ? !lit : false;
              return (
                <line
                  key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={e.cross ? b.color : a.color}
                  strokeWidth={lit ? 2.6 : e.cross ? 1.4 : 1}
                  strokeOpacity={off ? 0.05 : lit ? 0.85 : e.cross ? 0.4 : 0.22}
                  strokeDasharray={e.cross ? '5 4' : undefined}
                />
              );
            })}
          </g>

          {/* nodes */}
          <g>
            {[...g.nodes.values()].map(n => {
              const off = dim(n.id);
              const isSel = n.id === sel;
              return (
                <g
                  key={n.id}
                  className="mm-web-node"
                  opacity={off ? 0.12 : 1}
                  onClick={ev => { ev.stopPropagation(); setSel(n.id === sel ? null : n.id); }}
                  onPointerEnter={() => !sel && setHover(n.id)}
                  onPointerLeave={() => !sel && setHover(null)}
                >
                  <circle
                    cx={n.x} cy={n.y} r={n.r}
                    fill={n.kind === 'company' ? n.color : 'var(--surface)'}
                    stroke={n.color}
                    strokeWidth={isSel ? 5 : n.kind === 'vertical' ? 4 : 2.5}
                    fillOpacity={n.kind === 'company' ? (n.vertical === null ? 0.45 : 0.9) : 1}
                  />
                  {n.kind === 'company' && n.degree > 1 && (
                    <circle cx={n.x} cy={n.y} r={n.r + 4} fill="none"
                      stroke={n.color} strokeWidth={1.4} strokeOpacity={0.7} />
                  )}
                  {(n.kind !== 'company' || isSel || n.id === hover || (matches?.has(n.id) ?? false)) && (
                    <text
                      x={n.x} y={n.y - n.r - 7}
                      textAnchor="middle"
                      className={`mm-web-label ${n.kind}`}
                      style={{ fontSize: n.kind === 'vertical' ? 21 : n.kind === 'sector' ? 15 : 14 }}
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <aside className="mm-web-panel">
          {!selNode && (
            <>
              <div className="mm-web-ph">
                Click any dot to see what it connects to. Filled dots are companies, rings are
                sectors, heavy rings are verticals. A dot with a halo sits in more than one
                sector, and its dashed strands are the ones that cross markets.
              </div>
              <div className="mm-web-legend">
                {g.roots.map(r => {
                  const n = g.nodes.get(`s${r.id}`)!;
                  return (
                    <button key={r.id} type="button" className="mm-web-leg"
                      onClick={() => setSel(`s${r.id}`)}>
                      <i style={{ background: n.color }} />
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {selCompany && (
            <div className="mm-web-card">
              <h3>{selCompany.name}</h3>
              {selCompany.domain && (
                <a className="mm-web-dom" href={`https://${selCompany.domain}`}
                  target="_blank" rel="noreferrer">{selCompany.domain}</a>
              )}
              {selCompany.description && <p>{selCompany.description}</p>}
              <dl>
                {selCompany.arr && <><dt>ARR</dt><dd>{selCompany.arr}</dd></>}
                {selCompany.arr_growth && <><dt>Growth</dt><dd>{selCompany.arr_growth}</dd></>}
                {selCompany.latest_round && <><dt>Round</dt><dd>{selCompany.latest_round}</dd></>}
                {selCompany.round_amount && <><dt>Amount</dt><dd>{selCompany.round_amount}</dd></>}
                {selCompany.notable_investors && <><dt>Investors</dt><dd>{selCompany.notable_investors}</dd></>}
                {selCompany.headcount != null && <><dt>Headcount</dt><dd>{selCompany.headcount}</dd></>}
                {selCompany.hq && <><dt>HQ</dt><dd>{selCompany.hq}</dd></>}
              </dl>
              <h4>Sits in {selCompany.sectors.length} sector{selCompany.sectors.length === 1 ? '' : 's'}</h4>
              <ul className="mm-web-links">
                {selCompany.sectors.map(sid => (
                  <li key={sid}>
                    <button type="button" onClick={() => setSel(`s${sid}`)}>
                      {pathOf(g.byId, sid)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selSector && (
            <div className="mm-web-card">
              <h3>{selSector.name}</h3>
              <div className="mm-web-dom">{pathOf(g.byId, selSector.id)}</div>
              {selSector.note && <p>{selSector.note}</p>}
              <h4>{sectorMembers.length} compan{sectorMembers.length === 1 ? 'y' : 'ies'}</h4>
              <ul className="mm-web-links">
                {sectorMembers.map(c => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setSel(`c${c.id}`)}>
                      {c.name}
                      {c.sectors.length > 1 && <em> · in {c.sectors.length} sectors</em>}
                    </button>
                  </li>
                ))}
                {!sectorMembers.length && <li className="mm-web-none">No companies tagged here yet.</li>}
              </ul>
              {sectors.some(s => s.parent_id === selSector.id) && (
                <>
                  <h4>Sub-sectors</h4>
                  <ul className="mm-web-links">
                    {sectors.filter(s => s.parent_id === selSector.id).map(s => (
                      <li key={s.id}>
                        <button type="button" onClick={() => setSel(`s${s.id}`)}>{s.name}</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
