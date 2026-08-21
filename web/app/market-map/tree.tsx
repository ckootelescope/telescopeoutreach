'use client';

import { useState, useTransition, useRef } from 'react';
import {
  addSector, renameSector, deleteSector, moveSector,
  addCompany, updateCompany, deleteCompany,
} from './actions';

export type Sector = {
  id: number; parent_id: number | null; name: string;
  note: string | null; sort_order: number;
};

export type Company = {
  id: number; name: string; domain: string | null; description: string | null;
  latest_round: string | null; round_amount: string | null;
  notable_investors: string | null; arr: string | null; arr_growth: string | null;
  headcount: number | null; founded_year: number | null; hq: string | null;
  note: string | null; sectors: number[];
};

type TreeNode = Sector & { children: TreeNode[]; companies: Company[] };

function buildTree(sectors: Sector[], companies: Company[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  for (const s of sectors) map.set(s.id, { ...s, children: [], companies: [] });
  const roots: TreeNode[] = [];

  for (const s of sectors) {
    const node = map.get(s.id)!;
    if (s.parent_id && map.has(s.parent_id)) {
      map.get(s.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const c of companies) {
    for (const sid of c.sectors) {
      const node = map.get(sid);
      if (node) node.companies.push(c);
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

function countAll(node: TreeNode): number {
  let n = node.companies.length;
  for (const c of node.children) n += countAll(c);
  return n;
}

export function MarketTree({ sectors, companies }: { sectors: Sector[]; companies: Company[] }) {
  const tree = buildTree(sectors, companies);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [addingRoot, setAddingRoot] = useState(false);

  const toggle = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const expandAll = () => {
    setExpanded(new Set(sectors.map(s => s.id)));
  };

  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="mm-tree">
      <div className="mm-toolbar">
        <button type="button" className="mm-btn" onClick={() => setAddingRoot(true)}>+ Add vertical</button>
        <button type="button" className="mm-btn dim" onClick={expandAll}>Expand all</button>
        <button type="button" className="mm-btn dim" onClick={collapseAll}>Collapse all</button>
      </div>

      {addingRoot && (
        <AddSectorForm parentId={null} onDone={() => setAddingRoot(false)} />
      )}

      {tree.length === 0 && !addingRoot && (
        <div className="mm-empty">
          No sectors yet. Add a vertical to get started.
        </div>
      )}

      {tree.map(node => (
        <SectorNode
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          toggle={toggle}
        />
      ))}
    </div>
  );
}

function SectorNode({
  node, depth, expanded, toggle,
}: {
  node: TreeNode; depth: number; expanded: Set<number>; toggle: (id: number) => void;
}) {
  const isOpen = expanded.has(node.id);
  const total = countAll(node);
  const hasChildren = node.children.length > 0 || node.companies.length > 0;
  const [adding, setAdding] = useState<'sector' | 'company' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className={`mm-sector depth-${Math.min(depth, 4)}`}>
      <div
        className={`mm-sector-head${isOpen ? ' open' : ''}`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <button
          type="button"
          className="mm-expand"
          onClick={() => toggle(node.id)}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (isOpen ? '▾' : '▸') : '·'}
        </button>

        {renaming ? (
          <RenameForm id={node.id} current={node.name} onDone={() => setRenaming(false)} />
        ) : (
          <span className="mm-sector-name" onDoubleClick={() => setRenaming(true)}>
            {node.name}
          </span>
        )}

        <span className="mm-count">{total}</span>

        {showActions && !renaming && (
          <span className="mm-actions">
            <button type="button" onClick={() => { if (isOpen) { setAdding('sector'); } else { toggle(node.id); setTimeout(() => setAdding('sector'), 0); } }}>+ sub</button>
            <button type="button" onClick={() => { if (isOpen) { setAdding('company'); } else { toggle(node.id); setTimeout(() => setAdding('company'), 0); } }}>+ co</button>
            <button type="button" onClick={() => startTransition(async () => { const fd = new FormData(); fd.set('id', String(node.id)); fd.set('dir', 'up'); await moveSector(fd); })}>&#8593;</button>
            <button type="button" onClick={() => startTransition(async () => { const fd = new FormData(); fd.set('id', String(node.id)); fd.set('dir', 'down'); await moveSector(fd); })}>&#8595;</button>
            <button type="button" className="mm-del" onClick={() => {
              if (total > 0) {
                if (!confirm(`Delete "${node.name}" and all ${total} companies inside?`)) return;
              }
              startTransition(async () => { const fd = new FormData(); fd.set('id', String(node.id)); await deleteSector(fd); });
            }}>&#215;</button>
          </span>
        )}
      </div>

      {isOpen && (
        <div className="mm-sector-body">
          {node.children.map(child => (
            <SectorNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
            />
          ))}

          {node.companies.map(co => (
            <CompanyCard key={co.id} company={co} />
          ))}

          {adding === 'sector' && (
            <AddSectorForm parentId={node.id} onDone={() => setAdding(null)} />
          )}
          {adding === 'company' && (
            <AddCompanyForm sectorId={node.id} onDone={() => setAdding(null)} />
          )}
        </div>
      )}
    </div>
  );
}

function RenameForm({ id, current, onDone }: { id: number; current: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  return (
    <form
      className="mm-inline-form"
      onSubmit={e => {
        e.preventDefault();
        const name = ref.current?.value.trim();
        if (!name || name === current) { onDone(); return; }
        start(async () => {
          const fd = new FormData();
          fd.set('id', String(id));
          fd.set('name', name);
          await renameSector(fd);
          onDone();
        });
      }}
    >
      <input ref={ref} name="name" defaultValue={current} autoFocus disabled={pending}
        onKeyDown={e => e.key === 'Escape' && onDone()}
        onBlur={() => { if (!pending) onDone(); }}
      />
    </form>
  );
}

function AddSectorForm({ parentId, onDone }: { parentId: number | null; onDone: () => void }) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  return (
    <form
      className="mm-add-form"
      onSubmit={e => {
        e.preventDefault();
        const name = ref.current?.value.trim();
        if (!name) { onDone(); return; }
        start(async () => {
          const fd = new FormData();
          fd.set('name', name);
          if (parentId !== null) fd.set('parent_id', String(parentId));
          await addSector(fd);
          if (ref.current) ref.current.value = '';
          onDone();
        });
      }}
    >
      <input ref={ref} name="name" placeholder="Sector name..." autoFocus disabled={pending}
        onKeyDown={e => e.key === 'Escape' && onDone()}
      />
      <button type="submit" disabled={pending}>Add</button>
      <button type="button" onClick={onDone} className="dim">Cancel</button>
    </form>
  );
}

function AddCompanyForm({ sectorId, onDone }: { sectorId: number; onDone: () => void }) {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="mm-add-co-form"
      onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set('sector_id', String(sectorId));
        const name = fd.get('name')?.toString().trim();
        if (!name) { onDone(); return; }
        start(async () => {
          await addCompany(fd);
          formRef.current?.reset();
          onDone();
        });
      }}
    >
      <div className="mm-add-co-row">
        <input name="name" placeholder="Company name" autoFocus disabled={pending} />
        <input name="domain" placeholder="domain.com" disabled={pending} />
        <input name="latest_round" placeholder="Series A" disabled={pending} />
        <input name="round_amount" placeholder="$10M" disabled={pending} />
      </div>
      <div className="mm-add-co-row">
        <input name="notable_investors" placeholder="Notable investors" disabled={pending} className="wide" />
        <input name="description" placeholder="What they do (short)" disabled={pending} className="wide" />
      </div>
      <div className="mm-add-co-row">
        <input name="arr" placeholder="ARR" disabled={pending} />
        <input name="arr_growth" placeholder="Growth" disabled={pending} />
        <input name="headcount" placeholder="HC" type="number" disabled={pending} />
        <input name="note" placeholder="Notes" disabled={pending} className="wide" />
      </div>
      <div className="mm-add-co-btns">
        <button type="submit" disabled={pending}>Add company</button>
        <button type="button" onClick={onDone} className="dim">Cancel</button>
      </div>
    </form>
  );
}

function CompanyCard({ company: co }: { company: Company }) {
  const [editing, setEditing] = useState(false);
  const [showDel, setShowDel] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div
      className="mm-co"
      onMouseEnter={() => setShowDel(true)}
      onMouseLeave={() => setShowDel(false)}
    >
      <div className="mm-co-head">
        <span className="mm-co-name">{co.name}</span>
        {co.domain && <span className="mm-co-domain">{co.domain}</span>}
        {co.latest_round && (
          <span className="mm-co-round">
            {co.latest_round}{co.round_amount ? ` · ${co.round_amount}` : ''}
          </span>
        )}
        <span className="mm-co-tools">
          <button type="button" onClick={() => setEditing(!editing)} className="mm-edit-btn">
            {editing ? 'done' : 'edit'}
          </button>
          {showDel && (
            <button type="button" className="mm-del" onClick={() => {
              if (!confirm(`Remove ${co.name}?`)) return;
              start(async () => { const fd = new FormData(); fd.set('id', String(co.id)); await deleteCompany(fd); });
            }}>&#215;</button>
          )}
        </span>
      </div>

      {(co.notable_investors || co.description || co.arr || co.headcount || co.note) && !editing && (
        <div className="mm-co-meta">
          {co.description && <span className="mm-co-desc">{co.description}</span>}
          {co.notable_investors && <span className="mm-co-inv">{co.notable_investors}</span>}
          {(co.arr || co.arr_growth || co.headcount) && (
            <span className="mm-co-metrics">
              {co.arr && <span>ARR {co.arr}</span>}
              {co.arr_growth && <span>{co.arr_growth}</span>}
              {co.headcount && <span>{co.headcount} people</span>}
            </span>
          )}
          {co.note && <span className="mm-co-note">{co.note}</span>}
        </div>
      )}

      {editing && <EditCompanyPanel company={co} />}
    </div>
  );
}

function EditCompanyPanel({ company: co }: { company: Company }) {
  const [pending, start] = useTransition();

  const save = (field: string, value: string) => {
    start(async () => {
      const fd = new FormData();
      fd.set('id', String(co.id));
      fd.set('field', field);
      fd.set('value', value);
      await updateCompany(fd);
    });
  };

  return (
    <div className="mm-edit-panel">
      <EditField label="Name" field="name" value={co.name} onSave={save} disabled={pending} />
      <EditField label="Domain" field="domain" value={co.domain ?? ''} onSave={save} disabled={pending} />
      <EditField label="Description" field="description" value={co.description ?? ''} onSave={save} disabled={pending} />
      <EditField label="Round" field="latest_round" value={co.latest_round ?? ''} onSave={save} disabled={pending} />
      <EditField label="Amount" field="round_amount" value={co.round_amount ?? ''} onSave={save} disabled={pending} />
      <EditField label="Investors" field="notable_investors" value={co.notable_investors ?? ''} onSave={save} disabled={pending} />
      <EditField label="ARR" field="arr" value={co.arr ?? ''} onSave={save} disabled={pending} />
      <EditField label="Growth" field="arr_growth" value={co.arr_growth ?? ''} onSave={save} disabled={pending} />
      <EditField label="Headcount" field="headcount" value={co.headcount?.toString() ?? ''} onSave={save} disabled={pending} />
      <EditField label="Note" field="note" value={co.note ?? ''} onSave={save} disabled={pending} />
    </div>
  );
}

function EditField({
  label, field, value, onSave, disabled,
}: {
  label: string; field: string; value: string; onSave: (f: string, v: string) => void; disabled: boolean;
}) {
  const [val, setVal] = useState(value);
  const changed = val !== value;

  return (
    <div className="mm-ef">
      <label>{label}</label>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { if (changed) onSave(field, val); }}
        onKeyDown={e => { if (e.key === 'Enter' && changed) onSave(field, val); }}
        disabled={disabled}
      />
    </div>
  );
}
