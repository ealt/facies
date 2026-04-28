// AnalyticsPanels.jsx — Token Economics, Tool Effectiveness, Compaction, Subagents
// Each panel is a Bloomberg-style framed block, designed to live in the SessionDetail scroll.

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60_000) return (ms / 1000).toFixed(1) + 's';
  return (ms / 60_000).toFixed(1) + 'm';
}
function fmtBytes(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'MB';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'KB';
  return Math.round(n) + 'B';
}
function fmtPct(n) { return (n * 100).toFixed(1) + '%'; }
function fmtPctRound(n) { return Math.round(n * 100) + '%'; }

// ──────────────────────────────────────────────────────────────────────
// TOKEN ECONOMICS — full panel: KPIs, model badges, charts, per-model table
// ──────────────────────────────────────────────────────────────────────
function TokenEconomicsPanel({ session, apiCalls, perModel }) {
  const [expandedModel, setExpandedModel] = useState(null);
  const callsByModel = useMemo(() => {
    const m = {};
    apiCalls.forEach(c => { (m[c.model] ||= []).push(c); });
    Object.values(m).forEach(list => list.sort((a, b) => a.timestamp - b.timestamp));
    return m;
  }, [apiCalls]);
  const totalCost = apiCalls.reduce((s, c) => s + c.cost, 0);
  const totalIn = apiCalls.reduce((s, c) => s + c.totalInputTokens, 0);
  const totalFresh = apiCalls.reduce((s, c) => s + c.freshTokens, 0);
  const totalCacheRead = apiCalls.reduce((s, c) => s + c.cacheReadTokens, 0);
  const totalCacheWrite = apiCalls.reduce((s, c) => s + c.cacheWriteTokens, 0);
  const totalOut = apiCalls.reduce((s, c) => s + c.outputTokens, 0);
  const cacheRate = totalIn ? totalCacheRead / totalIn : 0;
  // What we paid; what we'd have paid w/o caching: cache reads at full input price
  const savedByCaching = totalCacheRead * (3 / 1_000_000) - totalCacheRead * (0.30 / 1_000_000);
  const avgCostPerTurn = apiCalls.length ? totalCost / apiCalls.length : 0;
  const inputBreakdown = `Fresh: ${fmtTokens(totalFresh)} · Cache read: ${fmtTokens(totalCacheRead)} · Cache create: ${fmtTokens(totalCacheWrite)}`;

  const KPI = ({ label, value, sub, cls }) => (
    <div className="kpi">
      <div className="l">{label}</div>
      <div className={`v ${cls || ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );

  return (
    <div className="panel" id="econ-panel">
      <div className="panel-head">
        <span>TOKEN ECONOMICS</span>
        <span className="est">{session.sessionId} · {apiCalls.length} api calls</span>
      </div>

      <div className="kpis" style={{ borderTop: 0 }}>
        <KPI label="TOTAL COST"      value={fmtCost(totalCost)}      cls="green" sub={`${apiCalls.length} api calls`} />
        <KPI label="INPUT TOKENS"    value={fmtTokens(totalIn)}      sub={inputBreakdown} />
        <KPI label="OUTPUT TOKENS"   value={fmtTokens(totalOut)} />
        <KPI label="CACHE HIT RATE"  value={fmtPct(cacheRate)}       cls="cyan" />
        <KPI label="SAVED BY CACHE"  value={fmtCost(savedByCaching)} cls="green" />
        <KPI label="AVG COST/TURN"   value={fmtCost(avgCostPerTurn)} />
      </div>

      <div className="panel-body" style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--ink-2)' }}>
          <span style={{ color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 'var(--tracked)', fontSize: 9 }}>Models</span>
          {perModel.map(m => (
            <span key={m.model} className="pill" style={{ fontFamily: 'var(--font-mono)' }}>{m.model}</span>
          ))}
        </div>
      </div>

      <div className="analytics-grid-2">
        <div className="analytics-cell">
          <div className="analytics-cell-head">CUMULATIVE COST</div>
          <window.CumulativeCostChart apiCalls={apiCalls} />
        </div>
        <div className="analytics-cell">
          <div className="analytics-cell-head">CACHE EFFICIENCY</div>
          <window.CacheEfficiencyChart apiCalls={apiCalls} />
        </div>
      </div>

      <div className="analytics-grid-2">
        <div className="analytics-cell">
          <div className="analytics-cell-head">COST BREAKDOWN <span className="cell-meta">by model</span></div>
          <div style={{ padding: 12 }}>
            <window.CostBreakdownBars perModel={perModel} />
          </div>
        </div>
        <div className="analytics-cell">
          <div className="analytics-cell-head">LATENCY VS INPUT TOKENS</div>
          <window.LatencyScatter apiCalls={apiCalls} />
          <div style={{ padding: '4px 12px 10px', display: 'flex', gap: 14, fontSize: 10, color: 'var(--ink-2)' }}>
            <span><span style={{ display:'inline-block', width:8, height:8, background:'#5dd9e0', marginRight:6, verticalAlign:'middle' }}/>sonnet</span>
            <span><span style={{ display:'inline-block', width:8, height:8, background:'#00d97e', marginRight:6, verticalAlign:'middle' }}/>haiku</span>
          </div>
        </div>
      </div>

      <div className="panel-body" style={{ paddingTop: 0 }}>
        <div className="analytics-cell-head" style={{ borderTop: 0 }}>PER-MODEL BREAKDOWN</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th className="r">API Calls</th>
              <th className="r">Input</th>
              <th className="r">Output</th>
              <th className="r">Cache Rate</th>
              <th className="r">Total Cost</th>
              <th className="r">Avg Latency</th>
            </tr>
          </thead>
          <tbody>
            {perModel.map(m => {
              const isOpen = expandedModel === m.model;
              const modelCalls = callsByModel[m.model] || [];
              return (
                <React.Fragment key={m.model}>
                  <tr
                    className={`tool-row ${isOpen ? 'open' : ''}`}
                    onClick={() => setExpandedModel(isOpen ? null : m.model)}
                    style={{ cursor: 'pointer' }}
                    title={isOpen ? 'Click to collapse' : `Click to inspect ${modelCalls.length} call${modelCalls.length === 1 ? '' : 's'}`}
                  >
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      <span style={{ display: 'inline-block', width: 10, color: 'var(--ink-3)', fontSize: 9, marginRight: 6 }}>{isOpen ? '▼' : '▶'}</span>
                      {m.model}
                    </td>
                    <td className="r">{m.apiCalls}</td>
                    <td className="r">{fmtTokens(m.inputTokens)}</td>
                    <td className="r">{fmtTokens(m.outputTokens)}</td>
                    <td className="r">{fmtPct(m.cacheRate)}</td>
                    <td className="r" style={{ color: 'var(--signal-green)' }}>{fmtCost(m.totalCost)}</td>
                    <td className="r">{fmtMs(m.avgLatencyMs)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="tool-row-detail">
                      <td colSpan={7} style={{ padding: 0, background: 'var(--bg-2)' }}>
                        <window.ModelCallDetail model={m} calls={modelCalls} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// TOOL EFFECTIVENESS
// ──────────────────────────────────────────────────────────────────────
function ToolEffectivenessPanel({ calls, summaries }) {
  const [sortKey, setSortKey] = useState('callCount');
  const [sortAsc, setSortAsc] = useState(false);

  const totalCalls = calls.length;
  const totalFails = calls.filter(c => c.failed).length;
  const successRate = totalCalls ? (totalCalls - totalFails) / totalCalls : 1;
  const totalRespBytes = calls.reduce((s, c) => s + c.responseSize, 0);

  const sorted = useMemo(() => {
    const sv = (s, k) => k === 'toolName' ? s.toolName.toLowerCase()
      : k === 'avgLatencyMs' ? (s.avgLatencyMs ?? -1)
      : (s[k] ?? -1);
    const list = [...summaries].sort((a, b) => {
      const av = sv(a, sortKey), bv = sv(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [summaries, sortKey, sortAsc]);

  const failedCalls = useMemo(() => calls.filter(c => c.failed)
    .sort((a, b) => a.endTimestamp - b.endTimestamp), [calls]);
  const [showFailures, setShowFailures] = useState(false);
  const [expandedTool, setExpandedTool] = useState(null);

  const callsByTool = useMemo(() => {
    const m = {};
    calls.forEach(c => { (m[c.toolName] ||= []).push(c); });
    Object.values(m).forEach(list => list.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)));
    return m;
  }, [calls]);

  function toggleSort(k) {
    if (sortKey === k) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(false); }
  }
  function sortInd(k) { return sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : ''; }

  const KPI = ({ label, value, cls }) => (
    <div className="kpi">
      <div className="l">{label}</div>
      <div className={`v ${cls || ''}`}>{value}</div>
    </div>
  );

  return (
    <div className="panel" id="tool-panel">
      <div className="panel-head">
        <span>TOOL EFFECTIVENESS</span>
        <span className="est">{totalCalls} calls · {summaries.length} unique tools</span>
      </div>
      <div className="kpis" style={{ borderTop: 0, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KPI label="TOTAL CALLS" value={totalCalls} />
        <KPI label="SUCCESS RATE" value={fmtPctRound(successRate)} cls={successRate < 0.8 ? 'red' : successRate < 0.95 ? 'amber' : 'green'} />
        <KPI label="UNIQUE TOOLS" value={summaries.length} />
        <KPI label="TOTAL RESPONSE" value={fmtBytes(totalRespBytes)} />
      </div>

      <div className="analytics-cell">
        <div className="analytics-cell-head">
          CONTEXT COST DISTRIBUTION
          <span className="cell-meta">~estimated tokens per tool · {(totalCalls/calls.length*100).toFixed(0)}% sample</span>
        </div>
        <div style={{ padding: 12 }}>
          <window.ToolCostStack summaries={summaries} />
        </div>
      </div>

      <div className="panel-body">
        <div className="analytics-cell-head" style={{ borderTop: 0 }}>TOOL SUMMARY</div>
        <table className="data-table sortable">
          <thead>
            <tr>
              <th onClick={() => toggleSort('toolName')}>Tool{sortInd('toolName')}</th>
              <th className="r" onClick={() => toggleSort('callCount')}>Calls{sortInd('callCount')}</th>
              <th className="r" onClick={() => toggleSort('successRate')}>Success{sortInd('successRate')}</th>
              <th className="r" onClick={() => toggleSort('avgLatencyMs')}>Avg Latency{sortInd('avgLatencyMs')}</th>
              <th className="r" onClick={() => toggleSort('avgInputSize')}>Avg Input{sortInd('avgInputSize')}</th>
              <th className="r" onClick={() => toggleSort('avgResponseSize')}>Avg Response{sortInd('avgResponseSize')}</th>
              <th className="r" onClick={() => toggleSort('totalContextTokens')}>~Ctx Tokens{sortInd('totalContextTokens')}</th>
              <th className="r" onClick={() => toggleSort('estimatedContextCost')}>~Est. Cost{sortInd('estimatedContextCost')}</th>
              <th className="r" onClick={() => toggleSort('costPerCall')}>~Cost/Call{sortInd('costPerCall')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const isOpen = expandedTool === s.toolName;
              const toolCalls = callsByTool[s.toolName] || [];
              return (
                <React.Fragment key={s.toolName}>
                  <tr
                    className={`tool-row ${isOpen ? 'open' : ''}`}
                    onClick={() => setExpandedTool(isOpen ? null : s.toolName)}
                    style={{ cursor: 'pointer' }}
                    title={isOpen ? 'Click to collapse' : `Click to see ${toolCalls.length} call${toolCalls.length === 1 ? '' : 's'}`}
                  >
                    <td>
                      <span style={{ display: 'inline-block', width: 10, color: 'var(--ink-3)', fontSize: 9, marginRight: 4 }}>{isOpen ? '▼' : '▶'}</span>
                      <span style={{ display: 'inline-block', width: 8, height: 8, background: window.TOOL_PALETTE[s.toolName] || 'var(--ink-3)', marginRight: 8, verticalAlign: 'middle' }}/>
                      <span style={{ color: 'var(--ink)' }}>{s.toolName}</span>
                    </td>
                    <td className="r">
                      {s.callCount}
                      {s.failureCount > 0 && (
                        <span style={{ color: 'var(--signal-red)', marginLeft: 6, fontSize: 10 }}>({s.failureCount} fail)</span>
                      )}
                    </td>
                    <td className="r" style={{ color: s.successRate < 0.8 ? 'var(--signal-red)' : s.successRate < 1 ? 'var(--signal-amber)' : 'var(--signal-green)' }}>
                      {fmtPctRound(s.successRate)}
                    </td>
                    <td className="r">
                      {fmtMs(s.avgLatencyMs)}
                      <span style={{ color: 'var(--ink-3)', fontSize: 10, marginLeft: 6 }}>p95: {fmtMs(s.p95LatencyMs)}</span>
                    </td>
                    <td className="r">{fmtBytes(s.avgInputSize)}</td>
                    <td className="r">{fmtBytes(s.avgResponseSize)}</td>
                    <td className="r">~{fmtTokens(s.totalContextTokens)}</td>
                    <td className="r">{fmtCost(s.estimatedContextCost)}</td>
                    <td className="r">{fmtCost(s.costPerCall)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="tool-row-detail">
                      <td colSpan={9} style={{ padding: 0, background: 'var(--bg-2)' }}>
                        <window.ToolCallDetail tool={s} calls={toolCalls} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="analytics-grid-2">
        <div className="analytics-cell">
          <div className="analytics-cell-head">TOOL TIMELINE <span className="cell-meta">over api call index</span></div>
          <window.ToolTimeline calls={calls} />
        </div>
        <div className="analytics-cell">
          <div className="analytics-cell-head">CONTEXT COST VS LATENCY <span className="cell-meta">dot size = response</span></div>
          <window.ToolScatter calls={calls} />
        </div>
      </div>

      {totalFails > 0 && (
        <div className="failure-panel">
          <button className="failure-head" onClick={() => setShowFailures(v => !v)}>
            <span style={{ fontSize: 8, color: 'var(--signal-red)' }}>{showFailures ? '▼' : '▶'}</span>
            <span>FAILURE ANALYSIS</span>
            <span className="failure-count">{totalFails} FAIL{totalFails === 1 ? '' : 'S'}</span>
          </button>
          {showFailures && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Tool</th>
                  <th>Error</th>
                  <th>Preceding Input</th>
                </tr>
              </thead>
              <tbody>
                {failedCalls.map(c => (
                  <tr key={c.index}>
                    <td style={{ color: 'var(--ink-3)', fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {new Date(c.endTimestamp).toLocaleTimeString('en-US', { hour12: false })}
                    </td>
                    <td>{c.toolName}</td>
                    <td style={{ color: 'var(--signal-red)' }}>{c.error}</td>
                    <td style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      {c.inputPreview || c.inputKeys.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// COMPACTION ANALYTICS — overview + per-compaction expandable cards
// ──────────────────────────────────────────────────────────────────────
function CompactionAnalyticsPanel({ compactions, snapshots, apiCalls, onInspect }) {
  const [expanded, setExpanded] = useState(new Set([0])); // first one open

  function toggle(i) {
    const n = new Set(expanded);
    n.has(i) ? n.delete(i) : n.add(i);
    setExpanded(n);
  }

  const avgPre = compactions.reduce((s, c) => s + c.preTokens, 0) / Math.max(1, compactions.length);
  const avgFreed = compactions.reduce((s, c) => s + (c.tokensFreed || 0), 0) / Math.max(1, compactions.length);
  const recoveryTurns = compactions.filter(c => c.recoveryTurns != null).map(c => c.recoveryTurns);
  const avgRecovery = recoveryTurns.length ? recoveryTurns.reduce((a, b) => a + b, 0) / recoveryTurns.length : null;

  const KPI = ({ label, value, sub, cls }) => (
    <div className="kpi">
      <div className="l">{label}</div>
      <div className={`v ${cls || ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );

  return (
    <div className="panel" id="compaction-panel">
      <div className="panel-head">
        <span>COMPACTION ANALYTICS</span>
        <span className="est">{compactions.length} event{compactions.length === 1 ? '' : 's'}</span>
      </div>

      <div className="kpis" style={{ borderTop: 0, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KPI label="COMPACTIONS" value={compactions.length} />
        <KPI label="AVG PRE-COMPACTION" value={fmtTokens(avgPre)} />
        <KPI label="AVG TOKENS FREED" value={'~' + fmtTokens(avgFreed)} cls="amber" />
        <KPI label="AVG RECOVERY TURNS" value={avgRecovery != null ? avgRecovery.toFixed(1) : '—'} sub={recoveryTurns.length < compactions.length ? `${compactions.length - recoveryTurns.length} unresolved` : null} />
      </div>

      <div className="analytics-cell">
        <div className="analytics-cell-head">SESSION COMPACTION TIMELINE</div>
        <window.CompactionContextChart apiCalls={apiCalls} snapshots={snapshots} compactions={compactions} />
        <div style={{ padding: '4px 12px 10px', display: 'flex', gap: 14, fontSize: 10, color: 'var(--ink-2)' }}>
          <span><span style={{ display:'inline-block', width:14, height:6, background:'#5dd9e0', opacity:0.4, marginRight:6, verticalAlign:'middle', border:'1px solid #5dd9e0' }}/>context size</span>
          <span><span style={{ display:'inline-block', width:14, borderTop:'2px dashed #ff4d4d', marginRight:6, verticalAlign:'middle' }}/>compaction</span>
        </div>
      </div>

      <div className="panel-body" style={{ paddingTop: 0 }}>
        <div className="analytics-cell-head" style={{ borderTop: 0 }}>COMPACTION DETAILS</div>
        <div className="cmp-list">
          {compactions.map((c, i) => {
            const isOpen = expanded.has(i);
            const freedPct = c.tokensFreed && c.preTokens ? c.tokensFreed / c.preTokens : null;
            const barPct = c.postTokens && c.preTokens ? Math.min(c.postTokens / c.preTokens, 1) : null;
            return (
              <div key={i} className="cmp-card">
                <button className="cmp-head" onClick={() => toggle(i)}>
                  <span className="cmp-caret" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                  <span className="cmp-title">COMPACTION #{i + 1}</span>
                  <span className="cmp-trigger">{c.trigger}</span>
                  <span className="cmp-flow">
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtTokens(c.preTokens)}</span>
                    <span style={{ color: 'var(--ink-3)', margin: '0 8px' }}>→</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{c.postTokens != null ? '~' + fmtTokens(c.postTokens) : '—'}</span>
                    {freedPct != null && (
                      <span style={{ color: 'var(--signal-green)', marginLeft: 12 }}>
                        (~{fmtPct(freedPct)} freed)
                      </span>
                    )}
                  </span>
                  <button className="cmp-inspect" onClick={(e) => { e.stopPropagation(); onInspect && onInspect(c); }}>
                    INSPECT ▸
                  </button>
                </button>
                {isOpen && (
                  <div className="cmp-body">
                    <div className="cmp-bars">
                      <div className="cmp-bar-row">
                        <span className="cmp-bar-lbl">BEFORE</span>
                        <div className="cmp-bar-track">
                          <div className="cmp-bar-fill" style={{ width: '100%', background: 'var(--signal-cyan)', opacity: 0.4 }}/>
                        </div>
                        <span className="cmp-bar-val">{fmtTokens(c.preTokens)}</span>
                      </div>
                      <div className="cmp-bar-row">
                        <span className="cmp-bar-lbl">AFTER ~</span>
                        <div className="cmp-bar-track">
                          {barPct != null && (
                            <div className="cmp-bar-fill" style={{ width: `${barPct * 100}%`, background: 'var(--signal-cyan)', opacity: 0.4 }}/>
                          )}
                        </div>
                        <span className="cmp-bar-val">{c.postTokens != null ? '~' + fmtTokens(c.postTokens) : '—'}</span>
                      </div>
                      {c.tokensFreed != null && (
                        <div style={{ color: 'var(--signal-green)', fontSize: 11, marginTop: 4 }}>
                          Freed: ~{fmtTokens(c.tokensFreed)} tokens (~{fmtPct(freedPct)})
                        </div>
                      )}
                    </div>

                    <div className="cmp-grid">
                      <Field k="Time" v={new Date(c.timestamp).toLocaleTimeString('en-US', { hour12: false })} />
                      <Field k="Time since session start" v={fmtDuration(c.elapsedMs)} />
                      <Field k="Turns before" v={String(c.turnsBefore)} />
                      <Field k="Cache rate before" v={c.cacheRateBefore != null ? fmtPct(c.cacheRateBefore) : '—'} />
                      <Field k="Cache rate after" v={c.cacheRateAfter != null ? fmtPct(c.cacheRateAfter) : '—'}
                        cls={c.cacheRateAfter != null && c.cacheRateBefore != null && c.cacheRateAfter < c.cacheRateBefore ? 'red' : ''} />
                      <Field k="Recovery turns"
                        v={c.recoveryTurns != null ? `${c.recoveryTurns} turn${c.recoveryTurns !== 1 ? 's' : ''} to >80%`
                          : 'unavailable — session ended'} />
                      <Field k="First post-compaction call cost" v={fmtCost(c.firstPostCompactionCost)} cls="amber" />
                      <Field k="Avg pre-compaction call cost" v={fmtCost(c.avgPreCompactionCost)} />
                    </div>

                    <div className="cmp-note">
                      "Before" is exact (from compactMetadata.preTokens). "After" is inferred from the next API call's total
                      input tokens. "Freed" is the difference.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {compactions.length === 0 && (
            <div style={{ padding: 24, color: 'var(--ink-3)', textAlign: 'center' }}>No compaction events in this session.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ k, v, cls }) {
  return (
    <div>
      <div style={{ color: 'var(--ink-3)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 'var(--tracked-tight)' }}>{k}</div>
      <div style={{ color: cls === 'red' ? 'var(--signal-red)' : cls === 'amber' ? 'var(--signal-amber)' : 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SUBAGENTS DEEP DIVE
// ──────────────────────────────────────────────────────────────────────
function SubagentsPanel({ summaries }) {
  const [expanded, setExpanded] = useState(new Set());

  function toggle(id) {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExpanded(n);
  }

  const totalCost = summaries.reduce((s, x) => s + x.totalCost, 0);
  const totalTok = summaries.reduce((s, x) => s + x.totalInputTokens + x.totalOutputTokens, 0);
  const totalCalls = summaries.reduce((s, x) => s + x.internalToolCalls, 0);

  const typeColor = (t) => t === 'Explore' ? 'var(--signal-cyan)'
    : t === 'Plan' ? 'var(--signal-purple)'
    : t === 'general-purpose' ? 'var(--signal-cyan)'
    : 'var(--ink-2)';

  const KPI = ({ label, value }) => (
    <div className="kpi">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
    </div>
  );

  return (
    <div className="panel" id="subagents-panel">
      <div className="panel-head">
        <span>SUBAGENTS DEEP DIVE</span>
        <span className="est">{summaries.length} agent{summaries.length === 1 ? '' : 's'} spawned</span>
      </div>

      <div className="kpis" style={{ borderTop: 0, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KPI label="AGENTS"          value={summaries.length} />
        <KPI label="INTERNAL CALLS"  value={totalCalls} />
        <KPI label="TOTAL TOKENS"    value={fmtTokens(totalTok)} />
        <KPI label="TOTAL COST"      value={fmtCost(totalCost)} />
      </div>

      <div className="panel-body">
        {summaries.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--ink-3)', textAlign: 'center' }}>No subagents were spawned in this session.</div>
        ) : (
          <div className="sub-list">
            {summaries.map(sub => {
              const isOpen = expanded.has(sub.agentId);
              return (
                <div key={sub.agentId} className="sub-card">
                  <div className="sub-head">
                    <span className="sub-type" style={{ color: typeColor(sub.agentType), borderColor: typeColor(sub.agentType) }}>
                      {sub.agentType}
                    </span>
                    <span className="sub-desc">{sub.description || sub.agentId}</span>
                    <span className="sub-id">{sub.agentId}</span>
                    <span className="sub-dur">{fmtDuration(sub.durationMs)}</span>
                  </div>
                  <div className="sub-metrics">
                    <Metric k="Tool Calls" v={sub.internalToolCalls} />
                    <Metric k="Tokens (in/out)" v={`${fmtTokens(sub.totalInputTokens)} / ${fmtTokens(sub.totalOutputTokens)}`} />
                    <Metric k="Cost" v={fmtCost(sub.totalCost) + (sub.costIsLowerBound ? '+' : '')} />
                    <Metric k="~Context Overhead" v={'~' + fmtTokens(sub.contextOverheadTokens) + ' tokens'} />
                  </div>
                  {sub.lastAssistantMessage && (
                    <div className="sub-final">
                      <button className="sub-final-head" onClick={() => toggle(sub.agentId)}>
                        <span style={{ fontSize: 8, color: 'var(--ink-3)' }}>{isOpen ? '▼' : '▶'}</span>
                        <span>FINAL OUTPUT</span>
                      </button>
                      {isOpen ? (
                        <pre className="sub-final-pre">{sub.lastAssistantMessage}</pre>
                      ) : (
                        <p className="sub-final-trunc">
                          {sub.lastAssistantMessage.length > 200
                            ? sub.lastAssistantMessage.slice(0, 200) + '…'
                            : sub.lastAssistantMessage}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ k, v }) {
  return (
    <div>
      <div style={{ color: 'var(--ink-3)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 'var(--tracked-tight)' }}>{k}</div>
      <div style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TOOL CALL DETAIL — expanded sub-row showing every call for one tool
// ─────────────────────────────────────────────────────────────────────
function ToolCallDetail({ tool, calls }) {
  const maxLat = Math.max(...calls.map(c => c.latencyMs), 1);
  const sessionStart = Math.min(...calls.map(c => c.timestamp));
  return (
    <div style={{ padding: '8px 12px 12px', borderTop: '1px dashed var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 4px 8px', color: 'var(--ink-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 'var(--tracked-tight)' }}>
        <span>↳ {calls.length} call{calls.length === 1 ? '' : 's'} · {tool.toolName}</span>
        <span>p50 {fmtMs(tool.avgLatencyMs)}</span>
        <span>p95 {fmtMs(tool.p95LatencyMs)}</span>
        {tool.failureCount > 0 && <span style={{ color: 'var(--signal-red)' }}>{tool.failureCount} failed</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>chronological · t+s from session start</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 60px 1fr 64px 64px 1.6fr', gap: 8, padding: '4px 4px 6px', color: 'var(--ink-3)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 'var(--tracked-tight)', borderBottom: '1px solid var(--border)' }}>
        <span>#</span>
        <span>t+</span>
        <span>input</span>
        <span style={{ textAlign: 'right' }}>resp</span>
        <span style={{ textAlign: 'right' }}>latency</span>
        <span>profile</span>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {calls.map((c, i) => {
          const tOff = ((c.timestamp - sessionStart) / 1000);
          const latPct = (c.latencyMs / maxLat) * 100;
          return (
            <div
              key={c.index}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 60px 1fr 64px 64px 1.6fr',
                gap: 8,
                alignItems: 'center',
                padding: '3px 4px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
                color: c.failed ? 'var(--signal-red)' : 'var(--ink-2)',
              }}
            >
              <span style={{ color: 'var(--ink-3)' }}>{String(i + 1).padStart(3, '0')}</span>
              <span style={{ color: 'var(--ink-3)' }}>{tOff.toFixed(0)}s</span>
              <span style={{ color: c.failed ? 'var(--signal-red)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.failed ? c.error : c.inputPreview}>
                {c.failed ? `✕ ${c.error}` : (c.inputPreview || '—')}
              </span>
              <span style={{ textAlign: 'right', color: c.failed ? 'var(--signal-red)' : 'var(--ink-2)' }}>{c.failed ? '—' : fmtBytes(c.responseSize)}</span>
              <span style={{ textAlign: 'right', color: c.latencyMs > tool.p95LatencyMs ? 'var(--signal-amber)' : 'var(--ink-2)' }}>{fmtMs(c.latencyMs)}</span>
              <span style={{ position: 'relative', height: 8, background: 'var(--bg-3)', overflow: 'hidden' }}>
                <span style={{
                  position: 'absolute',
                  inset: '0 auto 0 0',
                  width: `${latPct}%`,
                  background: c.failed ? 'var(--signal-red)' : (window.TOOL_PALETTE[c.toolName] || 'var(--ink-3)'),
                  opacity: c.failed ? 0.7 : 0.55,
                }} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.TokenEconomicsPanel = TokenEconomicsPanel;
window.ToolEffectivenessPanel = ToolEffectivenessPanel;
window.CompactionAnalyticsPanel = CompactionAnalyticsPanel;
window.SubagentsPanel = SubagentsPanel;
window.ToolCallDetail = ToolCallDetail;
window.ModelCallDetail = ModelCallDetail;

// ─────────────────────────────────────────────────────────────────────
// MODEL CALL DETAIL — expanded sub-row showing every API call for one model
// ─────────────────────────────────────────────────────────────────────
function ModelCallDetail({ model, calls }) {
  const maxCost = Math.max(...calls.map(c => c.cost), 0.0001);
  const sessionStart = Math.min(...calls.map(c => c.timestamp));
  const totalFresh = model.freshTokens;
  const totalCacheR = model.cacheReadTokens;
  const totalCacheW = model.cacheWriteTokens;
  const totalOut = model.outputTokens;
  const totalAll = totalFresh + totalCacheR + totalCacheW + totalOut;
  const segs = [
    { label: 'fresh in', v: totalFresh, color: 'var(--signal-amber)' },
    { label: 'cache rd', v: totalCacheR, color: 'var(--signal-cyan)' },
    { label: 'cache wr', v: totalCacheW, color: 'var(--signal-violet)' },
    { label: 'output',   v: totalOut,    color: 'var(--signal-green)' },
  ];
  const sortedByCost = [...calls].sort((a, b) => b.cost - a.cost).slice(0, 3);

  return (
    <div style={{ padding: '8px 12px 12px', borderTop: '1px dashed var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 4px 8px', color: 'var(--ink-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 'var(--tracked-tight)' }}>
        <span>↳ {calls.length} api call{calls.length === 1 ? '' : 's'} · {model.model}</span>
        <span>avg {fmtCost(model.totalCost / Math.max(1, calls.length))}/call</span>
        <span>cache rate {fmtPct(model.cacheRate)}</span>
        <span style={{ marginLeft: 'auto' }}>chronological · t+s from session start</span>
      </div>

      {/* Token mix bar */}
      <div style={{ padding: '4px 4px 10px' }}>
        <div style={{ display: 'flex', height: 14, border: '1px solid var(--border)' }}>
          {segs.map(s => s.v > 0 && (
            <div key={s.label} title={`${s.label}: ${fmtTokens(s.v)}`} style={{ width: `${(s.v / totalAll) * 100}%`, background: s.color, opacity: 0.85 }}/>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, paddingTop: 6, fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 'var(--tracked-tight)' }}>
          {segs.map(s => (
            <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, background: s.color, display: 'inline-block' }}/>
              {s.label}: <span style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>{fmtTokens(s.v)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Top 3 most expensive */}
      <div style={{ padding: '6px 4px', fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 'var(--tracked-tight)' }}>top 3 most expensive calls</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 4px 10px' }}>
        {sortedByCost.map(c => (
          <div key={c.index} style={{ border: '1px solid var(--border)', padding: 8, background: 'var(--bg-1)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-3)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 'var(--tracked-tight)', marginBottom: 4 }}>
              <span>call #{String(c.index + 1).padStart(2, '0')}</span>
              <span>t+{((c.timestamp - sessionStart) / 1000).toFixed(0)}s</span>
            </div>
            <div style={{ color: 'var(--signal-green)', fontSize: 14 }}>{fmtCost(c.cost)}</div>
            <div style={{ color: 'var(--ink-2)', fontSize: 10 }}>{fmtTokens(c.totalInputTokens)} in · {fmtTokens(c.outputTokens)} out · {fmtMs(c.latencyMs)}</div>
          </div>
        ))}
      </div>

      {/* Chronological list */}
      <div style={{ display: 'grid', gridTemplateColumns: '36px 60px 80px 80px 80px 80px 1fr', gap: 8, padding: '4px 4px 6px', color: 'var(--ink-3)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 'var(--tracked-tight)', borderBottom: '1px solid var(--border)' }}>
        <span>#</span>
        <span>t+</span>
        <span style={{ textAlign: 'right' }}>fresh in</span>
        <span style={{ textAlign: 'right' }}>cache rd</span>
        <span style={{ textAlign: 'right' }}>output</span>
        <span style={{ textAlign: 'right' }}>cost</span>
        <span>cost profile</span>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {calls.map(c => {
          const tOff = ((c.timestamp - sessionStart) / 1000);
          const costPct = (c.cost / maxCost) * 100;
          const isCompaction = c.stopReason === 'compaction';
          return (
            <div
              key={c.index}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 60px 80px 80px 80px 80px 1fr',
                gap: 8,
                alignItems: 'center',
                padding: '3px 4px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
                color: 'var(--ink-2)',
              }}
            >
              <span style={{ color: 'var(--ink-3)' }}>{String(c.index + 1).padStart(3, '0')}</span>
              <span style={{ color: 'var(--ink-3)' }}>{tOff.toFixed(0)}s</span>
              <span style={{ textAlign: 'right' }}>{fmtTokens(c.freshTokens)}</span>
              <span style={{ textAlign: 'right', color: 'var(--signal-cyan)' }}>{fmtTokens(c.cacheReadTokens)}</span>
              <span style={{ textAlign: 'right' }}>{fmtTokens(c.outputTokens)}</span>
              <span style={{ textAlign: 'right', color: 'var(--signal-green)' }}>{fmtCost(c.cost)}</span>
              <span style={{ position: 'relative', height: 8, background: 'var(--bg-3)', overflow: 'hidden' }}>
                <span style={{
                  position: 'absolute',
                  inset: '0 auto 0 0',
                  width: `${costPct}%`,
                  background: isCompaction ? 'var(--signal-red)' : 'var(--signal-green)',
                  opacity: 0.6,
                }} />
                {isCompaction && (
                  <span style={{ position: 'absolute', right: 4, top: -2, fontSize: 9, color: 'var(--signal-red)' }}>⚠ compact</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
