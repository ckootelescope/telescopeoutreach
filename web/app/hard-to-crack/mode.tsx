'use client';

import { useOptimistic, useTransition } from 'react';
import { setHtcMode } from '../actions';

const MODE: Record<string, string> = { auto: 'cadence', manual: 'manual', hold: 'holding' };

/**
 * The mode toggle, client side.
 *
 * As a plain form this was a full server round trip per click with no feedback:
 * the DB write, a revalidate, and a re-render of the whole table before anything
 * moved on screen. It read as broken even when it worked.
 *
 * useOptimistic paints the new mode on click and useTransition marks the row busy
 * until the server agrees. If the write fails React rolls the optimistic value
 * back on its own, so a failure looks like nothing happened rather than like a
 * success that silently did not stick.
 */
export function ModeToggle({ id, mode }: { id: number; mode: string }) {
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(mode);

  return (
    <div className={`modes${pending ? ' busy' : ''}`}>
      {(['auto', 'manual', 'hold'] as const).map((m) => (
        <button
          key={m}
          type="button"
          className={`modebtn${shown === m ? ' on' : ''}`}
          disabled={pending || shown === m}
          onClick={() => {
            start(async () => {
              setShown(m);
              const fd = new FormData();
              fd.set('id', String(id));
              fd.set('mode', m);
              await setHtcMode(fd);
            });
          }}
        >
          {MODE[m]}
        </button>
      ))}
    </div>
  );
}
