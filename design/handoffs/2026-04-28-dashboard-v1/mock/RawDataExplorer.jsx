// RawDataExplorer.jsx — searchable, syntax-highlighted JSONL viewer
// 4 streams: events, transcript, api-calls, tool-results. Filter toolbar + search.

const RDE_STREAMS = [
  { key: 'events',     label: 'EVENTS',       countKey: 'RAW_EVENTS' },
  { key: 'transcript', label: 'TRANSCRIPT',   countKey: 'RAW_TRANSCRIPT' },
  { key: 'api',        label: 'API CALLS',    countKey: 'RAW_API_CALLS' },
  { key: 'tools',      label: 'TOOL RESULTS', countKey: 'RAW_TOOL_RESULTS' },
];

function getStream(key) {
  return key === 'events'     ? window.RAW_EVENTS
       : key === 'transcript' ? window.RAW_TRANSCRIPT
       : key === 'api'        ? window.RAW_API_CALLS
       : key === 'tools'      ? window.RAW_TOOL_RESULTS
       : [];
}

// Syntax-highlight JSON. Returns array of {cls, text} chunks.
function tokenizeJson(str) {
  const tokens = [];
  // Order matters: strings first (incl. property names), then literals, then numbers, then punct.
  const re = /("([^"\\]|\\.)*"\s*:)|("([^"\\]|\\.)*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;
  let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) tokens.push({ cls: '', text: str.slice(last, m.index) });
    if (m[1]) tokens.push({ cls: 'jk', text: m[1] });
    else if (m[3]) tokens.push({ cls: 'js', text: m[3] });
    else if (m[5]) tokens.push({ cls: 'jl', text: m[5] });
    else if (m[6]) tokens.push({ cls: 'jn', text: m[6] });
    else if (m[7]) tokens.push({ cls: 'jp', text: m[7] });
    last = re.lastIndex;
  }
  if (last < str.length) tokens.push({ cls: '', text: str.slice(last) });
  return tokens;
}

// Highlight matching text within an already-pretty JSON string.
function HighlightedJson({ json, query }) {
  const tokens = tokenizeJson(json);
  if (!query) {
    return (
      <code className="rde-code">
        {tokens.map((t, i) => <span key={i} className={t.cls}>{t.text}</span>)}
      </code>
    );
  }
  const q = query.toLowerCase();
  return (
    <code className="rde-code">
      {tokens.map((t, i) => {
        // search inside t.text
        const lower = t.text.toLowerCase();
        if (!lower.includes(q)) return <span key={i} className={t.cls}>{t.text}</span>;
        const parts = [];
        let cursor = 0;
        let pos = lower.indexOf(q);
        while (pos !== -1) {
          if (pos > cursor) parts.push({ hit: false, text: t.text.slice(cursor, pos) });
          parts.push({ hit: true, text: t.text.slice(pos, pos + q.length) });
          cursor = pos + q.length;
          pos = lower.indexOf(q, cursor);
        }
        if (cursor < t.text.length) parts.push({ hit: false, text: t.text.slice(cursor) });
        return (
          <span key={i} className={t.cls}>
            {parts.map((p, j) => p.hit ? <mark key={j} className="rde-mark">{p.text}</mark> : <span key={j}>{p.text}</span>)}
          </span>
        );
      })}
    </code>
  );
}

function RawDataExplorer() {
  const [stream, setStream] = useState('events');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [pretty, setPretty] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [limit, setLimit] = useState(50);

  // Debounce query for perf on large streams
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  // Reset paging + expansion when stream/query changes
  useEffect(() => {
    setLimit(50);
    setExpanded(new Set());
  }, [stream, debouncedQuery, eventTypeFilter, errorsOnly]);

  const all = getStream(stream);

  // For events: collect distinct event types for filter chips
  const eventTypes = useMemo(() => {
    if (stream !== 'events') return [];
    return [...new Set(all.map(r => r.event))];
  }, [stream, all]);

  const filtered = useMemo(() => {
    let list = all;
    if (stream === 'events' && eventTypeFilter !== 'all') {
      list = list.filter(r => r.event === eventTypeFilter);
    }
    if (errorsOnly && stream === 'tools') {
      list = list.filter(r => r.error);
    }
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      list = list.filter(r => JSON.stringify(r).toLowerCase().includes(q));
    }
    return list;
  }, [all, stream, eventTypeFilter, errorsOnly, debouncedQuery]);

  const visible = filtered.slice(0, limit);

  function toggleRow(idx) {
    const n = new Set(expanded);
    n.has(idx) ? n.delete(idx) : n.add(idx);
    setExpanded(n);
  }

  function summarize(rec) {
    if (stream === 'events') {
      const lbl = rec.event;
      const sub = rec.toolName || rec.trigger || rec.model || (rec.turn != null ? `turn ${rec.turn}` : '');
      return { primary: lbl, secondary: sub, time: new Date(rec.timestamp).toLocaleTimeString('en-US', { hour12: false }) };
    }
    if (stream === 'transcript') {
      const role = rec.type === 'compaction' ? 'compaction' : rec.role;
      const preview = rec.type === 'compaction'
        ? `compaction · pre=${fmtTokens(rec.compactMetadata?.preTokens || 0)}`
        : (rec.content || '').slice(0, 80);
      return { primary: `[${role}]`, secondary: preview, time: new Date(rec.timestamp).toLocaleTimeString('en-US', { hour12: false }) };
    }
    if (stream === 'api') {
      return {
        primary: `api[${rec.apiCallIndex}]`,
        secondary: `${rec.model} · ${fmtTokens(rec.usage.input_tokens + rec.usage.cache_read_input_tokens + rec.usage.cache_creation_input_tokens)} in / ${fmtTokens(rec.usage.output_tokens)} out · ${fmtCost(rec.cost)}`,
        time: new Date(rec.timestamp).toLocaleTimeString('en-US', { hour12: false }),
      };
    }
    if (stream === 'tools') {
      return {
        primary: rec.toolName + (rec.error ? ' [ERR]' : ''),
        secondary: rec.error || rec.inputPreview || `${fmtBytes2(rec.responseBytes)} resp · ${rec.durationMs}ms`,
        time: new Date(rec.timestamp).toLocaleTimeString('en-US', { hour12: false }),
      };
    }
    return { primary: '', secondary: '', time: '' };
  }

  function copyAll() {
    const text = filtered.map(r => JSON.stringify(r)).join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  return (
    <div className="panel" id="raw-panel">
      <div className="panel-head">
        <span>RAW DATA EXPLORER</span>
        <span className="est">{filtered.length} / {all.length} record{all.length === 1 ? '' : 's'}</span>
      </div>

      <div className="rde-toolbar">
        <div className="rde-streams">
          {RDE_STREAMS.map(s => (
            <button
              key={s.key}
              className={'rde-stream' + (stream === s.key ? ' on' : '')}
              onClick={() => { setStream(s.key); setEventTypeFilter('all'); }}
            >
              {s.label}
              <span className="rde-stream-n">{(window[s.countKey] || []).length}</span>
            </button>
          ))}
        </div>
        <div className="rde-search">
          <span className="rde-search-prefix">/</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search this stream — values, keys, errors..."
            spellCheck={false}
          />
          {query && <button className="rde-clear" onClick={() => setQuery('')}>✕</button>}
        </div>
        <div className="rde-actions">
          <label className="rde-tog">
            <input type="checkbox" checked={pretty} onChange={e => setPretty(e.target.checked)} />
            <span>PRETTY</span>
          </label>
          <button className="rde-btn" onClick={copyAll} title="Copy filtered records as JSONL">
            COPY {filtered.length}
          </button>
        </div>
      </div>

      {(stream === 'events' && eventTypes.length > 0) && (
        <div className="rde-filters">
          <span className="rde-filter-lbl">EVENT TYPE:</span>
          <button className={'rde-chip' + (eventTypeFilter === 'all' ? ' on' : '')} onClick={() => setEventTypeFilter('all')}>
            ALL <span className="rde-chip-n">{all.length}</span>
          </button>
          {eventTypes.map(t => {
            const n = all.filter(r => r.event === t).length;
            return (
              <button key={t} className={'rde-chip' + (eventTypeFilter === t ? ' on' : '')} onClick={() => setEventTypeFilter(t)}>
                {t} <span className="rde-chip-n">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {stream === 'tools' && (
        <div className="rde-filters">
          <label className="rde-tog">
            <input type="checkbox" checked={errorsOnly} onChange={e => setErrorsOnly(e.target.checked)} />
            <span>ERRORS ONLY</span>
          </label>
        </div>
      )}

      <div className="rde-list">
        {visible.length === 0 && (
          <div style={{ padding: 32, color: 'var(--ink-3)', textAlign: 'center' }}>
            No records match {debouncedQuery ? <span>"<span style={{ color: 'var(--ink-2)' }}>{debouncedQuery}</span>"</span> : 'these filters'}.
          </div>
        )}
        {visible.map((rec, i) => {
          const sum = summarize(rec);
          const isOpen = expanded.has(i);
          const json = pretty ? JSON.stringify(rec, null, 2) : JSON.stringify(rec);
          const tagCls = stream === 'events' ? 'tag-' + rec.event
            : stream === 'transcript' ? 'tag-' + (rec.type === 'compaction' ? 'compaction' : rec.role)
            : stream === 'tools' && rec.error ? 'tag-error'
            : '';
          return (
            <div key={i} className={'rde-row' + (isOpen ? ' open' : '')}>
              <button className="rde-row-head" onClick={() => toggleRow(i)}>
                <span className="rde-row-caret">{isOpen ? '▼' : '▶'}</span>
                <span className="rde-row-idx">{String(i).padStart(3, '0')}</span>
                <span className="rde-row-time">{sum.time}</span>
                <span className={'rde-row-tag ' + tagCls}>{sum.primary}</span>
                <span className="rde-row-sec">{sum.secondary}</span>
              </button>
              {isOpen && (
                <pre className="rde-pre">
                  <HighlightedJson json={json} query={debouncedQuery} />
                </pre>
              )}
            </div>
          );
        })}
        {filtered.length > limit && (
          <button className="rde-more" onClick={() => setLimit(l => l + 100)}>
            LOAD 100 MORE <span className="rde-more-n">{filtered.length - limit} remaining</span>
          </button>
        )}
      </div>
    </div>
  );
}

function fmtBytes2(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'MB';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'KB';
  return Math.round(n) + 'B';
}

window.RawDataExplorer = RawDataExplorer;
