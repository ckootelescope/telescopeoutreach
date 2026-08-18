'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

type Msg = { role: string; content: string; created_at: string; actions_taken: any };

/**
 * The Sunday paragraph, and every mid-week correction after it.
 *
 * The textarea does not clear on failure: losing a paragraph you just typed
 * because the API was down is worse than a stale box.
 */
export function Chat({
  weekOf, intent, messages = [],
}: {
  weekOf: string | null;
  intent: string | null;
  messages?: Msg[];
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Grow with the paragraph rather than making Calvin scroll a four-line window.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(360, Math.max(96, el.scrollHeight)) + 'px';
  }, [text]);

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setErr(null);
    setReply(null);
    try {
      const r = await fetch('/api/week/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, weekOf }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || `Request failed (${r.status})`);
      } else {
        setReply(j.reply ?? null);
        setText('');
        router.refresh();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>
        Tell it what the week looks like
        <span className="count">{weekOf ? `week of ${weekOf}` : 'no week yet'}</span>
      </h2>
      <p className="note">
        Plain language. It writes to-dos from what you say, places them around your calendar,
        and never adds work you did not mention. Mid-week, say what moved.
      </p>

      <div className="panel chat">
        {intent && (
          <details className="intent">
            <summary>What you said on Sunday</summary>
            <p>{intent}</p>
          </details>
        )}

        {messages.length > 0 && (
          <div className="log">
            {messages.map((m, i) => (
              <div className={`turn ${m.role}`} key={i}>
                <span className="who">{m.role === 'calvin' ? 'you' : 'os'}</span>
                <div className="what">
                  {m.content}
                  {Array.isArray(m.actions_taken) && m.actions_taken.length > 0 && (
                    <div className="acts">
                      {m.actions_taken.map((a: any, j: number) => (
                        <span className="act" key={j}>{a.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {reply && (
          <div className="turn system fresh">
            <span className="who">os</span>
            <div className="what">{reply}</div>
          </div>
        )}

        {err && <div className="chat-err">{err}</div>}

        <div className="composer">
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="This week my priority is..."
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); }
            }}
            disabled={busy}
          />
          <div className="composer-foot">
            <span className="mono dim">⌘↵ to send</span>
            <button type="button" onClick={send} disabled={busy || !text.trim()}>
              {busy ? 'Working' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
