// KeyboardController.jsx — global hotkeys + cheatsheet overlay (Bloomberg-style).
//
// Exposes window dispatchers:
//   facies:focus-query  → QueryBar listens & focuses input
//   facies:nav          → { dir: 'up'|'down'|'open'|'first'|'last' } row navigation
//   facies:back         → Esc-style back/close
//   facies:goto         → { view: 'overview'|'projects' }
//   facies:next-session / facies:prev-session → cycle while in detail
//
// Sequences supported: "g s" (overview), "g p" (projects), "g h" (help)
// Vim-ish: j/k (down/up), Enter (open), [ ] (prev/next session)

const SHORTCUTS = [
  { group: 'NAVIGATION', items: [
    { keys: ['/'],            desc: 'Focus query bar' },
    { keys: ['?'],            desc: 'Show this help' },
    { keys: ['Esc'],          desc: 'Close overlay / back / clear' },
    { keys: ['j'],            desc: 'Move selection down' },
    { keys: ['k'],            desc: 'Move selection up' },
    { keys: ['Enter'],        desc: 'Open selected session' },
    { keys: ['['],            desc: 'Previous session (in detail)' },
    { keys: [']'],            desc: 'Next session (in detail)' },
  ]},
  { group: 'GO TO', items: [
    { keys: ['g','s'],        desc: 'Sessions overview' },
    { keys: ['g','p'],        desc: 'Projects view' },
    { keys: ['g','h'],        desc: 'Help (this panel)' },
  ]},
  { group: 'FUNCTION KEYS', items: [
    { keys: ['F1'],           desc: 'Sessions' },
    { keys: ['F2'],           desc: 'Projects' },
    { keys: ['F3'],           desc: 'Compactions' },
    { keys: ['F4'],           desc: 'Errors' },
    { keys: ['F5'],           desc: 'Refresh' },
    { keys: ['F8'],           desc: 'Query bar' },
  ]},
  { group: 'QUERY BAR', items: [
    { keys: ['/'],            desc: 'Focus' },
    { keys: ['Tab'],          desc: 'Accept suggestion' },
    { keys: ['↑','↓'],        desc: 'Navigate suggestions' },
    { keys: ['Enter'],        desc: 'Run query / accept' },
    { keys: ['Esc'],          desc: 'Blur input' },
  ]},
];

function HelpOverlay({ onClose }) {
  return (
    <div className="kb-backdrop" onClick={onClose}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-head">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="kb-head-tag">HELP</span>
            <span className="kb-head-title">KEYBOARD REFERENCE</span>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', color: 'var(--ink-3)',
            border: '1px solid var(--border-2)',
            padding: '2px 8px', font: 'var(--xsmall)', letterSpacing: 'var(--tracked)',
            cursor: 'pointer'
          }}>ESC</button>
        </div>
        <div className="kb-grid">
          {SHORTCUTS.map(sec => (
            <div key={sec.group} className="kb-section">
              <h4>{sec.group}</h4>
              {sec.items.map((item, i) => (
                <div key={i} className="kb-row">
                  <div className="kb-keys">
                    {item.keys.map((k, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && <span className="plus">then</span>}
                        <kbd>{k}</kbd>
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="kb-desc">{item.desc}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="kb-foot">
          FACIES TERMINAL · v0.4.2 · type any key to dismiss · sequences time out after 1s
        </div>
      </div>
    </div>
  );
}

function KeyboardController({ view, hasSelection, onSetView, onClearSelection, onCycleSession }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [chord, setChord] = useState(null); // first key of a 2-key sequence
  const [hint, setHint] = useState(null);

  const dispatch = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

  useEffect(() => {
    const handler = (e) => {
      // Don't intercept while typing in an input/textarea (except global escapes)
      const inField = e.target.matches?.('input, textarea, [contenteditable="true"]');

      // Global: Esc always works
      if (e.key === 'Escape') {
        if (helpOpen) { setHelpOpen(false); return; }
        if (inField) { e.target.blur(); return; }
        dispatch('facies:back');
        return;
      }

      if (inField) return;

      // Show help on ? (shift+/)
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      // Focus query on /
      if (e.key === '/') {
        e.preventDefault();
        dispatch('facies:focus-query');
        return;
      }

      // Two-key sequences ("g s", "g p", "g h")
      if (chord === 'g') {
        if (e.key === 's') { onSetView('overview'); onClearSelection(); setChord(null); setHint(null); return; }
        if (e.key === 'p') { onSetView('projects'); onClearSelection(); setChord(null); setHint(null); return; }
        if (e.key === 'h') { setHelpOpen(true); setChord(null); setHint(null); return; }
        setChord(null); setHint(null);
        return;
      }
      if (e.key === 'g') {
        setChord('g');
        setHint('g …  (s=sessions, p=projects, h=help)');
        setTimeout(() => { setChord(null); setHint(null); }, 1000);
        return;
      }

      // Row navigation
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); dispatch('facies:nav', { dir: 'down' }); return; }
      if (e.key === 'k' || e.key === 'ArrowUp')   { e.preventDefault(); dispatch('facies:nav', { dir: 'up' }); return; }
      if (e.key === 'Enter')                      { dispatch('facies:nav', { dir: 'open' }); return; }

      // Session cycling in detail view
      if (view === 'detail' && e.key === ']') { onCycleSession(+1); return; }
      if (view === 'detail' && e.key === '[') { onCycleSession(-1); return; }

      // Function keys (basic mapping)
      if (e.key === 'F1') { e.preventDefault(); onSetView('overview'); }
      if (e.key === 'F2') { e.preventDefault(); onSetView('projects'); }
      if (e.key === 'F8') { e.preventDefault(); dispatch('facies:focus-query'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [helpOpen, chord, view, onSetView, onClearSelection, onCycleSession]);

  return (
    <>
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
      {hint && (
        <div style={{
          position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--background)', border: '1px solid var(--signal-amber)',
          padding: '6px 12px', font: 'var(--code)', color: 'var(--signal-amber)',
          zIndex: 1500, letterSpacing: 'var(--tracked)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
        }}>
          {hint}
        </div>
      )}
    </>
  );
}

window.KeyboardController = KeyboardController;
