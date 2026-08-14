import 'server-only';
import { headers } from 'next/headers';

/**
 * Where this app is actually running.
 *
 * Deliberately does not depend on NEXT_PUBLIC_SITE_URL being set correctly.
 * That variable is baked in at build time, so setting it without redeploying
 * silently does nothing, and the symptom is a magic link that points at
 * localhost - which looks like a broken app rather than a missing setting.
 *
 * Order: an explicit override, then the domain Vercel injects on its own,
 * then the host the request actually arrived on.
 */
export async function siteOrigin(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  if (explicit) return explicit;

  // Vercel sets this automatically on every deployment. No configuration needed.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return 'http://localhost:3000';
}
