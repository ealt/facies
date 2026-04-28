// MessageThread.jsx — terminal-style expandable thread for a session.

const ROLE_COLORS = {
  user: 'var(--signal-cyan)',
  assistant: 'var(--signal-green)',
  assistant_thinking: 'var(--ink-3)',
  tool: 'var(--signal-amber-2)',
  subagent: 'var(--signal-purple)',
  compaction: 'var(--signal-amber)',
  finding: 'var(--signal-purple)',
};

const ROLE_GLYPHS = {
  user: '>',
  assistant: '·',
  assistant_thinking: '~',
  tool: '$',
  subagent: '⌘',
  compaction: '═',
  finding: '◆',
};

function fmtElapsed(ms) {
  if (ms == null) return '';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60_000) return (ms / 1000).toFixed(1) + 's';
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

// ────────────────────────────────────────────────────────────────────────────
// Atoms

function ThreadGutter({ event, focused }) {
  const role = event.role;
  const color = ROLE_COLORS[role] || 'var(--ink-3)';
  const glyph = ROLE_GLYPHS[role] || '·';
  return (
    <div className="thread-gutter" style={{ color }}>
      <div className="thread-gutter-i">{String(event.i ?? '').padStart(3, ' ')}</div>
      <div className="thread-gutter-glyph" style={{ color }}>{glyph}</div>
    </div>
  );
}

function ToolRow({ event, expanded, onToggle }) {
  const ok = event.ok !== false;
  return (
    <div className={`thread-row tool ${expanded ? 'expanded' : ''}`}>
      <div className="thread-tool-head" onClick={onToggle}>
        <span className="thread-tool-caret">{expanded ? '▼' : '▶'}</span>
        <span className="thread-tool-name">{event.tool}</span>
        <span className="thread-tool-args">({event.args})</span>
        <span className="thread-tool-arrow">→</span>
        <span className={`thread-tool-result ${ok ? '' : 'err'}`}>{event.result}</span>
        <span className="thread-tool-ok">{ok ? 'OK' : 'FAIL'}</span>
      </div>
      {expanded && (
        <div className="thread-tool-body">
          <div className="thread-tool-kv"><span className="k">TOOL</span><span className="v">{event.tool}</span></div>
          <div className="thread-tool-kv"><span className="k">ARGS</span><span className="v">{event.args}</span></div>
          <div className="thread-tool-kv"><span className="k">STATUS</span><span className={`v ${ok ? 'ok' : 'err'}`}>{ok ? 'OK' : 'FAIL'}</span></div>
          <div className="thread-tool-kv"><span className="k">RESULT</span><pre className="thread-tool-pre">{event.result}</pre></div>
        </div>
      )}
    </div>
  );
}

function ThinkingRow({ event, expanded, onToggle }) {
  return (
    <div className={`thread-row thinking ${expanded ? 'expanded' : ''}`}>
      <button className="thread-thinking-head" onClick={onToggle}>
        <span className="caret">{expanded ? '▼' : '▶'}</span>
        <span className="lbl">thinking</span>
        <span className="meta">· {fmtElapsed(event.durationMs)} · {window.fmtTokens(event.tokens)} tok</span>
      </button>
      {expanded && (
        <div className="thread-thinking-body">{event.text}</div>
      )}
    </div>
  );
}

function SubagentRow({ event, expanded, onToggle }) {
  return (
    <div className={`thread-row subagent ${expanded ? 'expanded' : ''}`}>
      <button className="thread-subagent-head" onClick={onToggle}>
        <span className="caret">{expanded ? '▼' : '▶'}</span>
        <span className="lbl">subagent</span>
        <span className="title">{event.label}</span>
        <span className="meta">· {fmtElapsed(event.durationMs)} · {window.fmtTokens(event.tokens)} tok</span>
      </button>
      {expanded && (
        <div className="thread-subagent-body">
          {event.children.map((c, i) => (
            <div key={i} className={`thread-subagent-child ${c.role}`}>
              <span className="role">{c.role.toUpperCase().padEnd(8, ' ')}</span>
              {c.role === 'tool' ? (
                <span><b>{c.tool}</b>({c.args}) → {c.result}</span>
              ) : (
                <span>{c.text}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompactionRow({ event, onInspect }) {
  const ratio = (1 - event.postTokens / event.preTokens) * 100;
  return (
    <div className="thread-compaction" onClick={onInspect} title="Click to inspect compaction">
      <span className="rule"></span>
      <span className="lbl">COMPACTION · API CALL {event.i}</span>
      <span className="metric">{window.fmtTokens(event.preTokens)} → {window.fmtTokens(event.postTokens)}</span>
      <span className="ratio">−{ratio.toFixed(0)}%</span>
      <span className="meta">summary {window.fmtTokens(event.summaryTokens)} · {fmtElapsed(event.durationMs)}</span>
      <span className="rule"></span>
      <span className="open-hint">INSPECT ›</span>
    </div>
  );
}

function MessageRow({ event }) {
  return (
    <div className={`thread-row msg ${event.role}`}>
      <span className="thread-msg-role">{event.role.toUpperCase()}</span>
      <span className="thread-msg-text">{event.text}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Thread

function MessageThread({ events, onInspectCompaction }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [filter, setFilter] = useState('all'); // all | messages | tools | thinking

  const toggle = (i) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const visible = useMemo(() => events.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'messages') return e.role === 'user' || e.role === 'assistant' || e.role === 'compaction';
    if (filter === 'tools') return e.role === 'tool' || e.role === 'subagent' || e.role === 'compaction';
    if (filter === 'thinking') return e.role === 'assistant_thinking' || e.role === 'compaction';
    return true;
  }), [events, filter]);

  // Stats for the header
  const stats = useMemo(() => {
    const counts = { user: 0, assistant: 0, tool: 0, thinking: 0, subagent: 0, compaction: 0 };
    for (const e of events) {
      if (e.role === 'assistant_thinking') counts.thinking++;
      else if (counts[e.role] != null) counts[e.role]++;
    }
    return counts;
  }, [events]);

  return (
    <div className="thread">
      <div className="thread-toolbar">
        <span className="thread-toolbar-stats">
          <span><b>{stats.user}</b> USER</span>
          <span><b>{stats.assistant}</b> ASST</span>
          <span><b>{stats.thinking}</b> THINK</span>
          <span><b>{stats.tool}</b> TOOL</span>
          <span><b>{stats.subagent}</b> SUB</span>
          <span><b>{stats.compaction}</b> COMP</span>
        </span>
        <span className="thread-toolbar-filter">
          {[
            ['all', 'ALL'],
            ['messages', 'MSGS'],
            ['tools', 'TOOLS'],
            ['thinking', 'THINK'],
          ].map(([k, l]) => (
            <button key={k} className={`btn ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </span>
      </div>

      <div className="thread-stream">
        {visible.map((event) => {
          if (event.role === 'compaction') {
            return <div key={event.i} className="thread-line"><CompactionRow event={event} onInspect={() => onInspectCompaction && onInspectCompaction(event)} /></div>;
          }
          const isOpen = expanded.has(event.i);
          return (
            <div key={event.i} className={`thread-line ${event.role}`}>
              <ThreadGutter event={event} />
              <div className="thread-content">
                {event.role === 'user' && <MessageRow event={event} />}
                {event.role === 'assistant' && <MessageRow event={event} />}
                {event.role === 'tool' && (
                  <ToolRow event={event} expanded={isOpen} onToggle={() => toggle(event.i)} />
                )}
                {event.role === 'assistant_thinking' && (
                  <ThinkingRow event={event} expanded={isOpen} onToggle={() => toggle(event.i)} />
                )}
                {event.role === 'subagent' && (
                  <SubagentRow event={event} expanded={isOpen} onToggle={() => toggle(event.i)} />
                )}
              </div>
            </div>
          );
        })}
        <div className="thread-cursor"><span className="blink">█</span> END OF SESSION</div>
      </div>
    </div>
  );
}

window.MessageThread = MessageThread;
