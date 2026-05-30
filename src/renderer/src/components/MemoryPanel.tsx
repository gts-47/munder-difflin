import { useEffect, useState } from 'react';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';

interface MemoryStatus {
  available: boolean;
  enabled: boolean;
  active: boolean;
  initialized: boolean;
  palacePath: string | null;
  model: 'minilm' | 'embeddinggemma';
  bin: string | null;
}

/**
 * Collapsible panel to search the hive's shared semantic memory (MemPalace) and
 * see whether the CLI is detected. Agents use the CLI directly; this lets the
 * human query the same palace.
 */
export function MemoryPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MemoryStatus | null>(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const refreshStatus = async () => {
    try { setStatus(await window.cth.memoryStatus()); } catch { /* ignore */ }
  };
  useEffect(() => { refreshStatus(); }, []);

  const setModel = async (model: 'minilm' | 'embeddinggemma') => {
    await window.cth.updateConfig({ embeddingModel: model });
    await refreshStatus();
  };
  const toggleEnabled = async () => {
    await window.cth.updateConfig({ semanticMemory: !(status?.enabled ?? true) });
    await refreshStatus();
  };

  const run = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setResult('');
    try {
      const res = await window.cth.searchMemory(query.trim());
      setResult(res.ok ? (res.output || '(no matches)') : `error: ${res.error}`);
    } finally {
      setBusy(false);
    }
  };

  const active = status?.active;
  const pill = active ? `🧠 memory · ${status?.model}` : '🧠 memory';

  return (
    <div style={{ position: 'absolute', bottom: 12, left: 12, width: open ? 360 : 'auto', zIndex: 40 }}>
      {!open ? (
        <button
          onClick={() => { setOpen(true); refreshStatus(); }}
          title="Search the hive's shared memory"
          style={{
            padding: '5px 10px 3px',
            background: active ? 'var(--cth-lemon-light)' : 'var(--cth-cream-200)',
            boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)',
            fontFamily: 'var(--cth-font-ui)',
            fontSize: 13,
            color: 'var(--cth-ink-900)',
            cursor: 'pointer',
            border: 'none'
          }}
        >
          {pill}
        </button>
      ) : (
        <PixelPanel variant="dialog" title="HIVE MEMORY" noPadding>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--cth-ink-700)' }}>
              {status?.available
                ? <>MemPalace detected · model <b>{status.model}</b> · {status.initialized ? 'palace ready' : 'palace initializing…'}</>
                : <>MemPalace CLI not found. Install with <code>uv tool install mempalace</code> to enable semantic search. Markdown memory still works.</>}
            </div>

            {/* Settings: enable + embedding model toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={toggleEnabled}
                title="Turn semantic memory on/off"
                style={{
                  padding: '4px 8px 2px', cursor: 'pointer', border: 'none',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 12,
                  background: status?.enabled ? 'var(--cth-mint-light)' : 'var(--cth-cream-200)',
                  boxShadow: `inset 0 0 0 1px ${status?.enabled ? 'var(--cth-mint)' : 'var(--cth-ink-500)'}`
                }}
              >
                {status?.enabled ? 'enabled' : 'disabled'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--cth-ink-500)', fontFamily: 'var(--cth-font-display)', textTransform: 'uppercase' }}>model</span>
              {(['minilm', 'embeddinggemma'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  title={m === 'minilm' ? 'Light, English, ~90 MB — best for low-RAM Macs' : 'Multilingual, ~300 MB'}
                  style={{
                    padding: '4px 8px 2px', cursor: 'pointer', border: 'none',
                    fontFamily: 'var(--cth-font-ui)', fontSize: 12,
                    background: status?.model === m ? 'var(--cth-lemon-light)' : 'var(--cth-cream-100)',
                    boxShadow: status?.model === m ? 'inset 0 0 0 2px var(--cth-ink-900)' : 'inset 0 0 0 1px var(--cth-ink-700)'
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
              Switching models re-indexes new writes going forward; existing entries keep their old embeddings until re-mined.
            </div>

            {status?.available && (
              <>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
                    placeholder="search the hive's memory by meaning…"
                    style={{
                      flex: 1, padding: '6px 8px 4px',
                      background: 'var(--cth-paper-100)', border: 'none',
                      boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)',
                      fontFamily: 'var(--cth-font-ui)', fontSize: 14,
                      color: 'var(--cth-ink-900)', outline: 'none'
                    }}
                  />
                  <PixelButton variant="primary" size="sm" onClick={run} disabled={busy}>
                    {busy ? '…' : 'search'}
                  </PixelButton>
                </div>
                {result && (
                  <pre style={{
                    margin: 0, maxHeight: '40vh', overflow: 'auto',
                    background: 'var(--cth-cream-100)',
                    boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)',
                    padding: 8, fontFamily: 'var(--cth-font-mono)', fontSize: 12,
                    whiteSpace: 'pre-wrap', color: 'var(--cth-ink-900)'
                  }}>{result}</pre>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <PixelButton variant="ghost" size="sm" onClick={() => setOpen(false)}>close</PixelButton>
            </div>
          </div>
        </PixelPanel>
      )}
    </div>
  );
}
