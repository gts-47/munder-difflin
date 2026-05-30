import { useEffect, useState, useCallback } from 'react';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';

interface Approval {
  id: string;
  from: string;
  to: string;
  act: string;
  subject: string;
  body: string;
  created_at: string;
}

/**
 * Floating queue of cross-agent requests the god agent escalated as critical.
 * The human approves (the held action proceeds) or rejects, optionally adding a
 * note that's relayed back to the asking agent as the human's answer.
 */
export function ApprovalsPanel() {
  const [items, setItems] = useState<Approval[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = (await window.cth.hiveApprovals()) as Approval[];
      setItems(Array.isArray(list) ? list : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 2500);
    return () => clearInterval(iv);
  }, [refresh]);

  const resolve = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      await window.cth.hiveResolveApproval(id, approve, notes[id]?.trim() || undefined);
      setItems((xs) => xs.filter((x) => x.id !== id));
      setNotes((n) => { const { [id]: _drop, ...rest } = n; void _drop; return rest; });
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <div style={{ position: 'absolute', top: 12, right: 12, width: 340, zIndex: 40 }}>
      <PixelPanel variant="dialog" title={`APPROVALS · ${items.length}`} noPadding>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, maxHeight: '60vh', overflowY: 'auto' }}>
          {items.map((m) => (
            <div
              key={m.id}
              style={{
                background: 'var(--cth-paper-100)',
                boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)',
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, color: 'var(--cth-ink-500)', textTransform: 'uppercase' }}>
                {m.from} → {m.to} · {m.act}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cth-ink-900)' }}>{m.subject || '(no subject)'}</div>
              {m.body && (
                <div style={{ fontSize: 13, color: 'var(--cth-ink-700)', maxHeight: 80, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                  {m.body}
                </div>
              )}
              <input
                value={notes[m.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [m.id]: e.target.value }))}
                placeholder="reply / note to the agent (optional)"
                style={{
                  width: '100%',
                  padding: '5px 7px 3px',
                  background: 'var(--cth-cream-100)',
                  border: 'none',
                  boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)',
                  fontFamily: 'var(--cth-font-ui)',
                  fontSize: 13,
                  color: 'var(--cth-ink-900)',
                  outline: 'none'
                }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <PixelButton variant="ghost" size="sm" onClick={() => resolve(m.id, false)} disabled={busy === m.id}>
                  reject
                </PixelButton>
                <PixelButton variant="primary" size="sm" onClick={() => resolve(m.id, true)} disabled={busy === m.id}>
                  approve
                </PixelButton>
              </div>
            </div>
          ))}
        </div>
      </PixelPanel>
    </div>
  );
}
