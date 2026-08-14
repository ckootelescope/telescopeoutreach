import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, checkPassword, cookieOptions, issue } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function signIn(formData: FormData) {
  'use server';
  const secret = process.env.CONSOLE_PASSWORD;
  const next = String(formData.get('next') ?? '/analytics') || '/analytics';

  if (!secret) redirect('/login?error=unset');
  if (!checkPassword(String(formData.get('password') ?? ''), secret)) {
    redirect('/login?error=wrong');
  }
  (await cookies()).set(COOKIE, await issue(secret), cookieOptions);
  redirect(next.startsWith('/') ? next : '/analytics');
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const q = await searchParams;
  const message =
    q.error === 'wrong' ? 'That password is not right.'
    : q.error === 'unset'
      ? 'CONSOLE_PASSWORD is not set on the server. Add it in Vercel under Settings, Environment Variables, then redeploy.'
      : null;

  return (
    <div className="wrap" style={{ maxWidth: 430, paddingTop: 90 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.015em' }}>Outreach Console</h1>
        <div className="mono dim">Telescope Partners</div>
      </div>
      <div className="panel">
        <form className="guard" action={signIn}>
          <input type="hidden" name="next" value={q.next ?? '/analytics'} />
          <label>
            Password
            <input type="password" name="password" required autoFocus autoComplete="current-password" />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </div>
      {message && <p className="mono dim">{message}</p>}
      <footer>
        This console holds founder contact details, so it is not public. One password, set as
        CONSOLE_PASSWORD on the server. Changing it signs out every device.
      </footer>
    </div>
  );
}
