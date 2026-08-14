import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Data client. Uses the service role key, so it bypasses row level security and
 * must never be constructed anywhere that ships to the browser. The `server-only`
 * import above turns a mistaken client import into a build error rather than a
 * leak of every founder's email address.
 *
 * PostgREST over HTTP rather than a pg connection: serverless functions open and
 * discard connections constantly, which exhausts a pooler.
 */
export const db = () =>
  createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Auth client. Anon key, reads and writes the session cookie. */
export async function authClient() {
  const store = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component, where cookies are read-only.
          // Middleware refreshes the session instead.
        }
      },
    },
  });
}

export async function currentUser() {
  const { data } = await (await authClient()).auth.getUser();
  return data.user ?? null;
}

export function isAllowed(email?: string | null) {
  if (!email) return false;
  const list = (process.env.ALLOWED_EMAILS ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}
