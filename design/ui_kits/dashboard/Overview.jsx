// Overview.jsx — KPI strip + query + sortable table, Bloomberg style.
const { useMemo: useMemoO, useState: useStateO } = React;

function KpiStrip({ totals }) {
  const tiles = [
    { l: 'Total Cost',       v: fmtCost(totals.cost),    cls: '' },
    { l: 'Input Tokens',     v: fmtTokens(totals.inTok), cls: '', sub: `cache rd ${fmtTokens(totals.cacheRead)}` },
    { l: 'Cache Hit Rate',   v: totals.hitRate.toFixed(1) + '%', cls: 'amber' },
    { l: 'Saved by Caching', v: fmtCost(totals.saved),   cls: 'green' },
    { l: 'Avg Cost/Call',    v: fmtCost(totals.avg),     cls: '' },
    { l: 'API Calls',        v: String(totals.calls),    cls: '' },
  ];
  return (
    <div className="kpis">
      {tiles.map((t,i) => (
        <div key={i} className="kpi">
          <div className="l">{t.l}</div>
          <div className={`v ${t.cls}`}>{t.v}</div>
          {t.sub && <div className="sub">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// QueryBar is defined in QueryBar.jsx and exposed as window.QueryBar.

function SessionTable({ sessions, onSelect, selectedId }) {
  const [sort, setSort] = useState({ key: 'startTime', dir: 'desc' });
  const [navIdx, setNavIdx] = useState(-1);
  const sorted = useMemo(() => {
    const out = [...sessions];
    out.sort((a,b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    return out;
  }, [sessions, sort]);

  // Listen for j/k/Enter from KeyboardController
  useEffect(() => {
    const onNav = (e) => {
      const dir = e.detail?.dir;
      if (dir === 'down') setNavIdx(i => Math.min(sorted.length - 1, (i < 0 ? -1 : i) + 1));
      if (dir === 'up')   setNavIdx(i => Math.max(0, (i < 0 ? 0 : i) - 1));
      if (dir === 'open') {
        const target = sorted[navIdx >= 0 ? navIdx : 0];
        if (target) onSelect(target);
      }
    };
    window.addEventListener('facies:nav', onNav);
    return () => window.removeEventListener('facies:nav', onNav);
  }, [sorted, navIdx, onSelect]);

  // Scroll selected row into view
  useEffect(() => {
    if (navIdx < 0) return;
    const row = document.querySelector(`tr[data-nav-idx="${navIdx}"]`);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [navIdx]);

  const summary = useMemo(() => ({
    cost: sessions.reduce((s,x)=>s+x.totalCost,0),
    tokens: sessions.reduce((s,x)=>s+x.totalInputTokens+x.totalOutputTokens,0),
  }), [sessions]);

  const onSort = key => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  const ind = key => sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div className="panel">
      <div className="panel-head">
        <span>SESSIONS</span>
        <span className="est">{sessions.length} ROWS · CLICK ROW TO INSPECT</span>
      </div>
      <table>
        <thead>
          <tr>
            <th onClick={() => onSort('title')}>TITLE{ind('title')}</th>
            <th onClick={() => onSort('project')}>PROJ{ind('project')}</th>
            <th onClick={() => onSort('model')}>MODEL{ind('model')}</th>
            <th onClick={() => onSort('startTime')}>STARTED{ind('startTime')}</th>
            <th className="r" onClick={() => onSort('totalInputTokens')}>TOKENS{ind('totalInputTokens')}</th>
            <th className="r" onClick={() => onSort('totalCost')}>COST{ind('totalCost')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="summary">
            <td colSpan="3">Σ {sessions.length} SESSIONS</td>
            <td>—</td>
            <td className="r">{fmtTokens(summary.tokens)}</td>
            <td className="r" style={{ color: 'var(--signal-green)' }}>{fmtCost(summary.cost)}</td>
          </tr>
          {sorted.map((s, i) => (
            <tr key={s.sessionId} data-nav-idx={i} className={`${selectedId === s.sessionId ? 'selected' : ''} ${navIdx === i ? 'kbd-cursor' : ''}`} onClick={() => onSelect(s)}>
              <td><span style={{ color: 'var(--ink)' }}>{s.title}</span> <span style={{ color: 'var(--ink-3)', marginLeft: 6, fontSize: 10 }}>{s.sessionId}</span></td>
              <td><span className="pill amber" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); window.__navigateToProject(s.project); }}>{s.project}</span></td>
              <td><span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--tracked-tight)', textTransform: 'uppercase' }}>{s.model.replace('claude-3-5-','').replace('claude-3-','')}</span></td>
              <td className="muted">{fmtTimeAgo(s.startTime)}</td>
              <td className="r">{fmtTokens(s.totalInputTokens)}</td>
              <td className="r" style={{ color: 'var(--signal-green)' }}>{fmtCost(s.totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({ totals, onSelect, selectedId }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) { return SESSIONS; }
    try {
      const q = query.toLowerCase();
      let out = SESSIONS;
      const projectMatch = q.match(/project\s*=\s*["']([^"']+)["']/);
      if (projectMatch) out = out.filter(s => s.project === projectMatch[1]);
      const modelMatch = q.match(/model\s*=\s*["']([^"']+)["']/);
      if (modelMatch) out = out.filter(s => s.model.includes(modelMatch[1]));
      const tokMatch = q.match(/total_tokens\s*([><=]+)\s*([0-9.]+)([km]?)/i);
      if (tokMatch) {
        const op = tokMatch[1];
        let n = parseFloat(tokMatch[2]);
        if (tokMatch[3].toLowerCase() === 'k') n *= 1000;
        if (tokMatch[3].toLowerCase() === 'm') n *= 1_000_000;
        out = out.filter(s => {
          const t = s.totalInputTokens + s.totalOutputTokens;
          if (op === '>')  return t > n;
          if (op === '<')  return t < n;
          if (op === '>=') return t >= n;
          if (op === '<=') return t <= n;
          return t === n;
        });
      }
      if (/\bbanana\b/.test(q)) throw new Error("expected number, got identifier 'banana'");
      setError('');
      return out;
    } catch (e) {
      setError(e.message);
      return SESSIONS;
    }
  }, [query]);

  return (
    <>
      <KpiStrip totals={totals} />
      <window.QueryBar value={query} onChange={v => { setQuery(v); setError(''); }} error={error} count={filtered.length} total={SESSIONS.length} />
      <SessionTable sessions={filtered} onSelect={onSelect} selectedId={selectedId} />
    </>
  );
}

window.Overview = Overview;
