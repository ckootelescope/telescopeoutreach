import Link from 'next/link';

const TABS = [
  { href: '/analytics', label: 'Analytics' },
  { href: '/guard', label: 'Before you send' },
];

export function Nav({ current }: { current: string }) {
  return (
    <nav className="top">
      <div>
        <h1>Outreach Console</h1>
        <div className="mono dim">Telescope Partners &middot; company outreach only</div>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={current === t.href ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
