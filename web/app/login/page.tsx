import { authClient, isAllowed } from '@/lib/supabase';
import { siteOrigin } from '@/lib/origin';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function sendLink(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  // Refuse before contacting Supabase, so this cannot be used to probe which
  // addresses exist or to mail anyone who is not the owner of this console.
  if (!isAllowed(email)) redirect('/login?error=not_allowed');

  const supabase = await authClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) redirect(`/login?error=send_failed&why=${encodeURIComponent(error.message)}`);
  redirect('/login?sent=1');
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; denied?: string; why?: string }>;
}) {
  const q = await searchParams;
  const origin = await siteOrigin();
  const message =
    q.sent ? 'Check your email. The link signs you in on this device.'
    : q.denied ? `${q.denied} is signed in but not on the allowlist.`
    : q.error === 'not_allowed' ? 'That address is not on the allowlist.'
    : q.error === 'send_failed' ? `Could not send the link. ${q.why ?? ''}`
    : q.error === 'bad_callback'
      ? 'That link did not complete sign in. It may have already been used, or expired.'
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
      <footer>
        This console holds founder contact details. Access is limited to the allowlist.
        <br />
        Sign-in links will return to <span className="dim">{origin}/auth/callback</span> — that
        exact address must be listed in Supabase under Authentication, URL Configuration,
        Redirect URLs.
      </footer>
    </div>
  );
}
