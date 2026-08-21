'use client';

import { useState, useMemo } from 'react';
import type { Sector, Company } from './tree';

const NODE_W = 172;
const NODE_H = 52;
const H_GAP = 16;
const V_GAP = 48;
const ROOT_GAP = 32;
const PAD = 32;

interface TNode {
  id: number; name: string; parentId: number | null; sortOrder: number;
  children: TNode[]; companies: Company[];
}

interface LNode {
  id: number; name: string; x: number; y: number;
  parentId: number | null; depth: number;
  directCos: number; totalCos: number;
}

function makeTree(sectors: Sector[], companies: Company[]): TNode[] {
  const map = new Map<number, TNode>();
  for (const s of sectors)
    map.set(s.id, { id: s.id, name: s.name, parentId: s.parent_id,
      sortOrder: s.sort_order, children: [], companies: [] });
  const roots: TNode[] = [];
  for (const s of sectors) {
    const node = map.get(s.id)!;
    if (s.parent_id && map.has(s.parent_id)) map.get(s.parent_id)!.children.push(node);
    else roots.push(node);
  }
  for (const c of companies)
    for (const sid of c.sectors) map.get(sid)?.companies.push(c);
  const sortAll = (ns: TNode[]) => { ns.sort((a, b) => a.sortOrder - b.sortOrder); ns.forEach(n => sortAll(n.children)); };
  sortAll(roots);
  return roots;
}

function countAll(n: TNode): number {
  return n.companies.length + n.children.reduce((s, c) => s + countAll(c), 0);
}

function computeLayout(roots: TNode[]) {
  const nodes: LNode[] = [];
  let cursor = PAD;

  function lay(node: TNode, depth: number): number {
    if (node.children.length === 0) {
      const x = cursor;
      cursor += NODE_W + H_GAP;
      nodes.push({ id: node.id, name: node.name, x, y: PAD + depth * (NODE_H + V_GAP),
        parentId: node.parentId, depth, directCos: node.companies.length, totalCos: countAll(node) });
      return x + NODE_W / 2;
    }
    const centers = node.children.map(c => lay(c, depth + 1));
    const center = (centers[0] + centers[centers.length - 1]) / 2;
    const x = Math.max(PAD, center - NODE_W / 2);
    nodes.push({ id: node.id, name: node.name, x, y: PAD + depth * (NODE_H + V_GAP),
      parentId: node.parentId, depth, directCos: node.companies.length, totalCos: countAll(node) });
    return center;
  }

  for (const root of roots) { lay(root, 0); cursor += ROOT_GAP; }
  const maxX = Math.max(...nodes.map(n => n.x + NODE_W), 0);
  const maxY = Math.max(...nodes.map(n => n.y + NODE_H), 0);
  return { nodes, width: maxX + PAD, height: maxY + PAD };
}

function findNode(roots: TNode[], id: number): TNode | null {
  for (const r of roots) {
    if (r.id === id) return r;
    const f = findNode(r.children, id);
    if (f) return f;
  }
  return null;
}

function trunc(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function MapView({ sectors, companies }: { sectors: Sector[]; companies: Company[] }) {
  const tree = useMemo(() => makeTree(sectors, companies), [sectors, companies]);
  const layout = useMemo(() => computeLayout(tree), [tree]);
  const [selId, setSelId] = useState<number | null>(null);

  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));

  const edges = layout.nodes
    .filter(n => n.parentId !== null && nodeMap.has(n.parentId!))
    .map(n => {
      const p = nodeMap.get(n.parentId!)!;
      return { key: `${p.id}-${n.id}`,
        x1: p.x + NODE_W / 2, y1: p.y + NODE_H,
        x2: n.x + NODE_W / 2, y2: n.y };
    });

  const selTree = selId !== null ? findNode(tree, selId) : null;

  return (
    <div>
      <div className="mm-viz">
        <svg width={layout.width} height={layout.height} className="mm-svg">
          {edges.map(e => {
            const my = (e.y1 + e.y2) / 2;
            return (
              <path key={e.key}
                d={`M${e.x1},${e.y1} C${e.x1},${my} ${e.x2},${my} ${e.x2},${e.y2}`}
                fill="none" stroke="var(--line-2)" strokeWidth={1.5} />
            );
          })}
          {layout.nodes.map(n => (
            <g key={n.id} onClick={() => setSelId(selId === n.id ? null : n.id)}
               style={{ cursor: 'pointer' }}>
              <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={8}
                fill={selId === n.id ? 'var(--accent-soft)' : 'var(--surface)'}
                stroke={n.depth === 0 || selId === n.id ? 'var(--accent)' : 'var(--line-2)'}
                strokeWidth={n.depth === 0 || selId === n.id ? 2 : 1} />
              <text x={n.x + 10} y={n.y + 22}
                fontSize={n.depth === 0 ? 13 : 12}
                fontWeight={n.depth === 0 ? 700 : 600}
                fill="var(--ink)" fontFamily="var(--sans)">
                {trunc(n.name, 20)}
              </text>
              {n.totalCos > 0 && (
                <text x={n.x + 10} y={n.y + 40}
                  fontSize={10} fill="var(--ink-3)" fontFamily="var(--mono)">
                  {n.directCos > 0
                    ? `${n.directCos} ${n.directCos === 1 ? 'company' : 'companies'}`
                    : `${n.totalCos} total`}
                </text>
              )}
              {n.totalCos === 0 && (
                <text x={n.x + 10} y={n.y + 40}
                  fontSize={10} fill="var(--ink-3)" fontFamily="var(--mono)"
                  fontStyle="italic">
                  empty
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {selTree && (
        <div className="mm-detail">
          <div className="mm-detail-head">
            <h3>{selTree.name}</h3>
            <span className="mm-detail-count">
              {selTree.companies.length} {selTree.companies.length === 1 ? 'company' : 'companies'}
            </span>
            <button type="button" onClick={() => setSelId(null)} className="mm-detail-close">&times;</button>
          </div>
          {selTree.companies.length > 0 ? (
            <div className="mm-detail-cos">
              {selTree.companies.map(c => (
                <div key={c.id} className="mm-detail-co">
                  <div className="mm-detail-co-top">
                    <span className="mm-co-name">{c.name}</span>
                    {c.domain && <span className="mm-co-domain">{c.domain}</span>}
                    {c.latest_round && (
                      <span className="mm-co-round">
                        {c.latest_round}{c.round_amount ? ` · ${c.round_amount}` : ''}
                      </span>
                    )}
                  </div>
                  {c.description && <div className="mm-detail-co-desc">{c.description}</div>}
                  {c.notable_investors && <div className="mm-detail-co-inv">{c.notable_investors}</div>}
                  {(c.arr || c.arr_growth || c.headcount) && (
                    <div className="mm-detail-co-metrics">
                      {c.arr && <span>ARR {c.arr}</span>}
                      {c.arr_growth && <span>{c.arr_growth}</span>}
                      {c.headcount && <span>{c.headcount} people</span>}
                    </div>
                  )}
                  {c.note && <div className="mm-detail-co-note">{c.note}</div>}
                </div>
              ))}
            </div>
          ) : (
            <p className="dim" style={{ padding: '8px 0', fontSize: 13 }}>
              No companies in this sector yet. Switch to List view to add some.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
