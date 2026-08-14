/**
 * Session for a one-person console.
 *
 * Magic links meant an email provider, a redirect allowlist and an anon key had
 * to be right before the app would open at all. This is one shared password in
 * an environment variable and a signed cookie. No mail is sent, so nothing can
 * rate limit you out of your own dashboard.
 *
 * The cookie carries an expiry and an HMAC over it, keyed by the password, so a
 * cookie cannot be forged or extended without knowing it. Changing the password
 * invalidates every existing session for free.
 *
 * Uses Web Crypto rather than node:crypto because middleware runs on the edge.
 */
export const COOKIE = 'console_session';
const DAYS = 30;

const enc = new TextEncoder();

async function key(secret: string) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
}

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function sign(payload: string, secret: string) {
  return hex(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload)));
}

/** Compare without leaking how much of the value matched. */
function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issue(secret: string): Promise<string> {
  const exp = String(Date.now() + DAYS * 864e5);
  return `${exp}.${await sign(exp, secret)}`;
}

export async function valid(token: string | undefined, secret: string | undefined) {
  if (!token || !secret) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  if (!Number(exp) || Number(exp) < Date.now()) return false;
  return sameString(sig, await sign(exp, secret));
}

export function checkPassword(given: string, expected: string | undefined) {
  if (!expected) return false;
  return sameString(given, expected);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: DAYS * 24 * 60 * 60,
};
