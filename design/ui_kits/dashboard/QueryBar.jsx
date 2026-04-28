// QueryBar.jsx — Bloomberg-style query input with autocomplete, recent, and syntax tokens.
//
// Grammar (loose):
//   <field> <op> <value> [AND|OR <expr>]*
// Fields: project, model, total_tokens, cache_hit, cost, has_compaction, started, calls
// Ops:    =  !=  >  <  >=  <=  ~  in
// Values: "string"  number  number(K|M)  true|false  (a, b)

const QB_FIELDS = [
  { key: 'project',         desc: 'project name',                values: () => window.PROJECTS.map(p => `"${p.id}"`) },
  { key: 'model',           desc: 'model id (substring ok)',     values: () => ['"sonnet"', '"haiku"', '"opus"'] },
  { key: 'total_tokens',    desc: 'sum of input+output tokens',  numeric: true },
  { key: 'input_tokens',    desc: 'input tokens',                numeric: true },
  { key: 'cache_hit',       desc: 'cache hit rate %',            numeric: true },
  { key: 'cost',            desc: 'session cost USD',            numeric: true },
  { key: 'calls',           desc: 'API call count',              numeric: true },
  { key: 'duration',        desc: 'session duration in minutes', numeric: true },
  { key: 'started',         desc: 'session start (relative ok)', values: () => ['"today"','"yesterday"','"-7d"','"-30d"'] },
  { key: 'has_compaction',  desc: 'sessions that compacted',     values: () => ['true','false'] },
];

const QB_OPS = ['=', '!=', '>', '<', '>=', '<=', '~'];
const QB_BOOL = ['AND', 'OR', 'NOT'];

const QB_HISTORY_KEY = 'facies.queryHistory';
function loadQbHistory() {
  try { return JSON.parse(localStorage.getItem(QB_HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveQbHistory(q) {
  if (!q.trim()) return;
  const cur = loadQbHistory();
  const next = [q, ...cur.filter(x => x !== q)].slice(0, 12);
  localStorage.setItem(QB_HISTORY_KEY, JSON.stringify(next));
}

// Tokenize an in-progress query.
// Returns array of {kind: 'field'|'op'|'value'|'bool'|'ws'|'unknown', text, start, end}.
function qbTokenize(q) {
  const out = [];
  let i = 0;
  const re = /\s+|"[^"]*"|'[^']*'|>=|<=|!=|[=<>~]|\bAND\b|\bOR\b|\bNOT\b|\(|\)|[A-Za-z_][\w.]*|\d+(\.\d+)?[KkMm]?|./g;
  let m;
  while ((m = re.exec(q)) !== null) {
    const t = m[0]; const start = m.index; const end = start + t.length;
    let kind;
    if (/^\s+$/.test(t)) kind = 'ws';
    else if (/^(AND|OR|NOT)$/.test(t)) kind = 'bool';
    else if (QB_OPS.includes(t)) kind = 'op';
    else if (/^["']/.test(t) || /^[0-9]/.test(t) || /^(true|false)$/.test(t)) kind = 'value';
    else if (QB_FIELDS.find(f => f.key === t)) kind = 'field';
    else kind = 'unknown';
    out.push({ kind, text: t, start, end });
  }
  return out;
}

// Predict what comes next based on the trailing meaningful token.
function qbPredict(q, caret) {
  const before = q.slice(0, caret);
  const tokens = qbTokenize(before).filter(t => t.kind !== 'ws');
  const last = tokens[tokens.length - 1];

  // Empty / right after AND/OR/NOT/( → suggest fields
  if (!last || last.kind === 'bool' || last.text === '(') {
    return QB_FIELDS.map(f => ({
      type: 'field', label: f.key, hint: f.desc, insert: f.key + ' ',
    }));
  }
  // After a field → suggest operators
  if (last.kind === 'field') {
    return QB_OPS.map(o => ({ type: 'op', label: o, hint: '', insert: o + ' ' }));
  }
  // After an op → suggest values for that field
  if (last.kind === 'op') {
    const field = tokens[tokens.length - 2];
    const def = QB_FIELDS.find(f => f.key === field?.text);
    if (def?.values) {
      return def.values().map(v => ({ type: 'value', label: v, hint: 'sample', insert: v + ' ' }));
    }
    if (def?.numeric) {
      return [
        { type: 'value', label: '1M', hint: 'one million', insert: '1M ' },
        { type: 'value', label: '500K', hint: '', insert: '500K ' },
        { type: 'value', label: '100', hint: '', insert: '100 ' },
        { type: 'value', label: '10', hint: '', insert: '10 ' },
      ];
    }
    return [];
  }
  // After a value → suggest boolean ops
  if (last.kind === 'value') {
    return QB_BOOL.map(b => ({ type: 'bool', label: b, hint: '', insert: ' ' + b + ' ' }));
  }
  return [];
}

function QBSyntax({ tokens }) {
  // Renders the same string with each token wrapped in a class, mirroring the input.
  return (
    <div className="qb-syntax" aria-hidden>
      {tokens.map((t, i) => {
        if (t.kind === 'ws') return <span key={i}>{t.text.replace(/ /g, '\u00A0')}</span>;
        return <span key={i} className={`qb-tok qb-${t.kind}`}>{t.text}</span>;
      })}
    </div>
  );
}

function QueryBar({ value, onChange, error, count, total }) {
  const [open, setOpen] = useState(false);
  const [caret, setCaret] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(loadQbHistory);
  const inputRef = useRef(null);

  const tokens = useMemo(() => qbTokenize(value), [value]);
  const suggestions = useMemo(() => qbPredict(value, caret), [value, caret]);

  const commit = (next) => {
    onChange(next);
    saveQbHistory(next);
    setHistory(loadQbHistory());
  };

  const insert = (sug) => {
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    // If user is mid-token, don't double-insert; replace from start of that token.
    const lastTok = qbTokenize(before).filter(t => t.kind !== 'ws').pop();
    let cutFrom = before.length;
    if (lastTok && (lastTok.kind === 'unknown' || (lastTok.kind === 'field' && sug.type !== 'op'))) {
      // mid-typing a field/value: replace from the start of that token
      // only when prediction kind matches what we'd be typing
      if (sug.type === 'field' || sug.type === 'value') cutFrom = lastTok.start;
    }
    const next = before.slice(0, cutFrom) + sug.insert + after;
    onChange(next);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const newCaret = (cutFrom + sug.insert.length);
      inputRef.current?.setSelectionRange(newCaret, newCaret);
      setCaret(newCaret);
    });
  };

  // Hook the global "/" focus event
  useEffect(() => {
    const onFocus = () => { inputRef.current?.focus(); inputRef.current?.select(); setOpen(true); };
    window.addEventListener('facies:focus-query', onFocus);
    return () => window.removeEventListener('facies:focus-query', onFocus);
  }, []);

  const onKey = (e) => {
    if (!open) setOpen(true);
    if (e.key === 'Tab' || (e.key === 'Enter' && suggestions.length)) {
      const sug = suggestions[activeIdx];
      if (sug) {
        e.preventDefault();
        insert(sug);
        setActiveIdx(0);
        return;
      }
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % Math.max(1, suggestions.length)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => (i - 1 + suggestions.length) % Math.max(1, suggestions.length)); }
    if (e.key === 'Escape')    { setOpen(false); setShowHistory(false); inputRef.current?.blur(); }
    if (e.key === 'Enter' && !suggestions.length) {
      commit(value); setOpen(false); inputRef.current?.blur();
    }
  };

  return (
    <div className="panel qb-panel">
      <div className="panel-head">
        <span>QUERY · <kbd>/</kbd></span>
        <span className="est">
          {count} OF {total} ROWS
          {history.length > 0 && (
            <button className="qb-history-btn" onClick={() => setShowHistory(s => !s)}>
              <span className="qb-clock">⌚</span> RECENT ({history.length})
            </button>
          )}
        </span>
      </div>
      <div className="panel-body qb-body">
        <div className="qb-row">
          <span className="qb-prompt">&gt;</span>
          <div className="qb-input-wrap">
            <QBSyntax tokens={tokens} />
            <input
              ref={inputRef}
              className={`qb-input ${error ? 'err' : ''}`}
              value={value}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={e => { onChange(e.target.value); setCaret(e.target.selectionStart || 0); setActiveIdx(0); }}
              onKeyDown={onKey}
              onKeyUp={e => setCaret(e.target.selectionStart || 0)}
              onClick={e => setCaret(e.target.selectionStart || 0)}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder='project = "facies" AND total_tokens > 1M'
            />
          </div>
          {value && (
            <button className="qb-clear" onClick={() => { onChange(''); inputRef.current?.focus(); }} title="clear (Esc)">×</button>
          )}
        </div>

        {error && <div className="err-msg qb-err">ERR · {error}</div>}

        {/* Autocomplete dropdown */}
        {open && suggestions.length > 0 && !showHistory && (
          <div className="qb-pop">
            <div className="qb-pop-head">SUGGESTIONS · <span style={{ color: 'var(--ink-3)' }}>↑↓ to navigate · Tab/Enter to insert · Esc to close</span></div>
            {suggestions.slice(0, 8).map((s, i) => (
              <div key={i}
                   className={`qb-sug ${i === activeIdx ? 'active' : ''}`}
                   onMouseDown={(e) => { e.preventDefault(); insert(s); }}
                   onMouseEnter={() => setActiveIdx(i)}>
                <span className={`qb-sug-tag qb-${s.type}`}>{s.type}</span>
                <span className="qb-sug-label">{s.label}</span>
                {s.hint && <span className="qb-sug-hint">{s.hint}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Recent dropdown */}
        {showHistory && (
          <div className="qb-pop qb-history">
            <div className="qb-pop-head">RECENT QUERIES</div>
            {history.length === 0 && <div className="qb-empty">no history yet</div>}
            {history.map((h, i) => (
              <div key={i} className="qb-sug" onMouseDown={(e) => { e.preventDefault(); onChange(h); setShowHistory(false); inputRef.current?.focus(); }}>
                <span className="qb-sug-tag">recall</span>
                <span className="qb-sug-label" style={{ fontFamily: 'var(--font-mono)' }}>{h}</span>
              </div>
            ))}
          </div>
        )}

        {/* Hint strip */}
        {!open && !error && !value && (
          <div className="qb-hint">
            try: <code>project = "facies"</code> · <code>total_tokens &gt; 1M</code> · <code>has_compaction = true</code> · press <kbd>/</kbd> to focus, <kbd>Tab</kbd> to autocomplete
          </div>
        )}
      </div>
    </div>
  );
}

window.QueryBar = QueryBar;
