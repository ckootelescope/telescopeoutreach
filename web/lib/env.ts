/**
 * Environment checks with readable failures.
 *
 * A missing key otherwise surfaces as "a client-side exception has occurred",
 * which says nothing about which variable is absent or where to set it.
 */
export const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CONSOLE_PASSWORD',
] as const;

/** Which variables are present. Never returns a value, only whether it is set. */
export function envReport() {
  const present = (k: string) => {
    const v = process.env[k];
    return typeof v === 'string' && v.trim().length > 0;
  };
  return {
    ok: REQUIRED.every(present),
    vars: Object.fromEntries(REQUIRED.map((k) => [k, present(k)])),
    missing: REQUIRED.filter((k) => !present(k)),
  };
}
