'use client';

// Without this, Next shows "a client-side exception has occurred" and the real
// cause is only visible in the Vercel runtime logs.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="wrap" style={{ maxWidth: 620, paddingTop: 80 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Something broke</h1>
        <div className="mono dim">Outreach Console</div>
      </div>
      <div className="panel" style={{ padding: 16 }}>
        <p className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {error.message || 'No message was attached to this error.'}
        </p>
        {error.digest && (
          <p className="mono dim" style={{ marginBottom: 0 }}>
            Digest {error.digest} — search this in Vercel → Deployments → Runtime Logs.
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={reset}>Try again</button>
        <a href="/api/health" className="mono" style={{ alignSelf: 'center' }}>
          Check configuration
        </a>
      </div>
    </div>
  );
}
