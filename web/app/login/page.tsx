import { authClient, isAllowed } from '@/lib/supabase';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function sendLink(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  // Refuse before contacting Supabase, so this cannot be used to probe which
  // addresses exist or to mail anyone who is not the owner of this console.
  if (!isAllowed(email)) redirect('/login?error=not_allowed');

  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
    },
  });
  redirect(error ? '/login?error=send_failed' : '/login?sent=1');
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; denied?: string }>;
}) {
  const q = await searchParams;
  const message =
    q.sent ? 'Check your email. The link signs you in on this device.'
    : q.denied ? `${q.denied} is signed in but not on the allowlist.`
    : q.error === 'not_allowed' ? 'That address is not on the allowlist.'
    : q.error === 'send_failed' ? 'Could not send the link. Try again.'
    : null;

  return (
    <div className="wrap" style={{ maxWidth: 460, paddingTop: 90 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.015em' }}>Outreach Console</h1>
        <div className="mono dim">Telescope Partners</div>
      </div>
      <div className="panel">
        <form className="guard" action={sendLink}>
          <label>Email
            <input type="email" name="email" required placeholder="you@telescopepartners.com" />
          </label>
          <button type="submit">Send link</button>
        </form>
      </div>
      {message && <p className="mono dim">{message}</p>}
      <footer>This console holds founder contact details. Access is limited to the allowlist.</footer>
    </div>
  );
}
