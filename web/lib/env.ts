/**
 * Environment checks with readable failures.
 *
 * A missing key otherwise surfaces as "a client-side exception has occurred",
 * which says nothing about which variable is absent or where to set it.
 */
export const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ALLOWED_EMAILS',
] as const;

/** Which variables are present. Never returns a value, only whether it is set. */
export function envReport() {
  const present = (k: string) => {
    const v = process.env[k];
    return typeof v === 'string' && v.trim().length > 0;
  };
  return {
    ok: REQUIRED.every(present),
    vars: Object.fromEntries([...REQUIRED, 'NEXT_PUBLIC_SITE_URL'].map((k) => [k, present(k)])),
    missing: REQUIRED.filter((k) => !present(k)),
  };
}

export function requireEnv(name: (typeof REQUIRED)[number]): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Missing ${name}. Set it in Vercel under Settings -> Environment Variables ` +
        `for the Production environment, then redeploy. Variables beginning ` +
        `NEXT_PUBLIC_ are baked in at build time, so adding one without a ` +
        `redeploy has no effect.`,
    );
  }
  return v;
}
