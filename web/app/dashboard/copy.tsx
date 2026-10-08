'use client';

import { useState } from 'react';

/** Copies the escalation ask so it can go straight into the HTC channel. */
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="fbtn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch { /* clipboard blocked; the text is still selectable */ }
      }}
    >
      {done ? 'Copied' : 'Copy ask'}
    </button>
  );
}
