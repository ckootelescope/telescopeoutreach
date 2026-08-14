'use client';

// Catches failures in the root layout itself, where app/error.tsx cannot run.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-monospace, monospace', padding: 40, lineHeight: 1.6 }}>
        <h1 style={{ fontSize: 18 }}>Outreach Console failed to start</h1>
        <p style={{ whiteSpace: 'pre-wrap' }}>{error.message}</p>
        {error.digest && <p>Digest {error.digest}</p>}
        <p>
          <a href="/api/health">Check configuration</a>
        </p>
      </body>
    </html>
  );
}
