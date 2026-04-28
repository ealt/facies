// States.jsx — empty / loading / error / over-budget / no-data state primitives.
// Use these whenever a panel can't render its normal content.
//
// Visual rules:
//   • Box-drawn frames in --border or accent (no soft borders, no rounded edges)
//   • Action verbs in caps, monospace
//   • Status code prefix (E001, W042, INFO, etc.) — feels like a real CLI
//   • No emoji, no illustrations. Text + 1 SVG glyph max.

const StatesUI = (() => {

  // ─── Box-drawing helpers ─────────────────────────────────────────────
  function StatusGlyph({ kind }) {
    // kind: 'info' | 'warn' | 'error' | 'empty' | 'loading'
    const COLOR = {
      info: 'var(--signal-cyan)',
      warn: 'var(--signal-amber)',
      error: 'var(--signal-red)',
      empty: 'var(--ink-3)',
      loading: 'var(--signal-amber)',
    }[kind];
    if (kind === 'loading') {
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ verticalAlign: '-2px' }}>
          <rect x="1.5" y="6" width="2" height="2" fill={COLOR}>
            <animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite" begin="0s"/>
          </rect>
          <rect x="6" y="6" width="2" height="2" fill={COLOR}>
            <animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite" begin="0.3s"/>
          </rect>
          <rect x="10.5" y="6" width="2" height="2" fill={COLOR}>
            <animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite" begin="0.6s"/>
          </rect>
        </svg>
      );
    }
    if (kind === 'empty') {
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ verticalAlign: '-2px' }}>
          <rect x="1" y="1" width="12" height="12" fill="none" stroke={COLOR} strokeDasharray="2 2"/>
        </svg>
      );
    }
    if (kind === 'warn') {
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ verticalAlign: '-2px' }}>
          <path d="M7 1 L13 12 L1 12 Z" fill="none" stroke={COLOR} strokeWidth="1.5" strokeLinejoin="miter"/>
          <line x1="7" y1="5" x2="7" y2="9" stroke={COLOR} strokeWidth="1.5"/>
          <rect x="6.25" y="10" width="1.5" height="1.5" fill={COLOR}/>
        </svg>
      );
    }
    if (kind === 'error') {
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ verticalAlign: '-2px' }}>
          <rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke={COLOR} strokeWidth="1.5"/>
          <path d="M4 4 L10 10 M10 4 L4 10" stroke={COLOR} strokeWidth="1.5"/>
        </svg>
      );
    }
    // info
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" style={{ verticalAlign: '-2px' }}>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke={COLOR} strokeWidth="1.5"/>
        <rect x="6.25" y="6" width="1.5" height="4.25" fill={COLOR}/>
        <rect x="6.25" y="3.5" width="1.5" height="1.5" fill={COLOR}/>
      </svg>
    );
  }

  /**
   * StatusBlock — full-panel status frame.
   * Slot it INSIDE a .panel-body to occupy the panel's content area.
   *
   * Props:
   *   kind:    'empty' | 'loading' | 'error' | 'warn' | 'info'
   *   code:    'E042', 'W001', 'INFO', etc.
   *   title:   short ALL-CAPS description
   *   detail:  longer prose, technical
   *   actions: [{label, onClick, primary?}]
   *   meta:    optional key/value rows
   */
  function StatusBlock({ kind = 'info', code, title, detail, actions = [], meta = [] }) {
    const COLOR = {
      info: 'var(--signal-cyan)',
      warn: 'var(--signal-amber)',
      error: 'var(--signal-red)',
      empty: 'var(--ink-3)',
      loading: 'var(--signal-amber)',
    }[kind];
    return (
      <div className="status-block" style={{ borderColor: COLOR }}>
        <div className="sb-row">
          <span className="sb-glyph"><StatusGlyph kind={kind}/></span>
          {code && <span className="sb-code" style={{ color: COLOR }}>{code}</span>}
          <span className="sb-title">{title}</span>
        </div>
        {detail && <div className="sb-detail">{detail}</div>}
        {meta.length > 0 && (
          <div className="sb-meta">
            {meta.map((m, i) => (
              <div className="sb-meta-row" key={i}>
                <span className="sb-meta-k">{m.k}</span>
                <span className="sb-meta-v">{m.v}</span>
              </div>
            ))}
          </div>
        )}
        {actions.length > 0 && (
          <div className="sb-actions">
            {actions.map((a, i) => (
              <button
                key={i}
                className={`sb-action ${a.primary ? 'primary' : ''}`}
                onClick={a.onClick}
              >
                {a.label}
                {a.kbd && <span className="sb-kbd">{a.kbd}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /**
   * SkeletonLines — loading skeleton built from monospace block characters.
   * Render N lines of ░-fill with random widths.
   */
  function SkeletonLines({ rows = 6, accent = 'var(--ink-3)' }) {
    const lines = Array.from({ length: rows }, (_, i) => {
      const len = 30 + ((i * 17) % 30);
      return '░'.repeat(len);
    });
    return (
      <div className="skeleton" style={{ color: accent }}>
        {lines.map((l, i) => (
          <div key={i} className="skel-line" style={{ animationDelay: `${i * 80}ms` }}>{l}</div>
        ))}
      </div>
    );
  }

  /**
   * SkeletonRows — table skeleton: N rows of pulsing cells.
   */
  function SkeletonRows({ rows = 5, cols = 6 }) {
    return (
      <table className="skel-table">
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => {
                const w = 40 + ((r * 7 + c * 13) % 40);
                return (
                  <td key={c}>
                    <span className="skel-cell" style={{ width: w + '%', animationDelay: `${(r + c) * 60}ms` }}/>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return { StatusBlock, SkeletonLines, SkeletonRows, StatusGlyph };
})();

window.StatusBlock = StatesUI.StatusBlock;
window.SkeletonLines = StatesUI.SkeletonLines;
window.SkeletonRows = StatesUI.SkeletonRows;
window.StatusGlyph = StatesUI.StatusGlyph;
