import { envReport } from '@/lib/env';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Configuration check, reachable without signing in — you cannot sign in until
 * the configuration is right, so gating this would be circular.
 *
 * Reports only whether each variable is set. Never a value, and never anything
 * from the database.
 */
export async function GET() {
  const env = envReport();

  let database: { reachable: boolean; detail: string } = {
    reachable: false,
    detail: 'not attempted',
  };

  if (env.ok) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const s = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      const { error } = await s.from('an_trust').select('overdue').limit(1).single();
      database = error
        ? { reachable: false, detail: error.message }
        : { reachable: true, detail: 'an_trust readable' };
    } catch (e) {
      database = { reachable: false, detail: (e as Error).message };
    }
  }

  return NextResponse.json(
    {
      ok: env.ok && database.reachable,
      env: env.vars,
      missing: env.missing,
      database,
      hint: env.missing.length
        ? `Set ${env.missing.join(', ')} in Vercel, then redeploy.`
        : database.reachable
          ? 'Configuration looks correct.'
          : 'Keys are set but Supabase rejected them. Check the service_role key was copied whole.',
    },
    { status: env.ok && database.reachable ? 200 : 503 },
  );
}
