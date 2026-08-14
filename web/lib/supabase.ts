import 'server-only';
import { createClient } from '@supabase/supabase-js';

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
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
