import Link from 'next/link';

const TABS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/week', label: 'Week' },
  { href: '/hard-to-crack', label: 'Hard to Crack' },
  { href: '/investors', label: 'Investors' },
  { href: '/analytics', label: 'Outreach' },
];

export function Nav({ current }: { current: string }) {
  return (
    <nav className="top">
      <div>
        <h1>Telescope OS</h1>
        <div className="mono dim">Calvin Koo &middot; week, pipeline, outreach</div>
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
