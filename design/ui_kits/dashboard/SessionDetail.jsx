// SessionDetail.jsx — Bloomberg-style detail view
// Layout: stratigraphy, top stats grid, then a stack of full analytical panels
// (Token Economics, Tool Effectiveness, Compaction Analytics, Subagents, Raw Data Explorer).

function SessionDetail({ session }) {
  const [mode, setMode] = useState('cumulative');
  const [inspecting, setInspecting] = useState(null);

  // Pull analytics data (lazy-friendly — these are window globals from analytics-data.js)
  const apiCalls   = window.API_CALLS || [];
  const perModel   = window.PER_MODEL || [];
  const toolCalls  = window.TOOL_CALLS || [];
  const toolSummary= window.TOOL_SUMMARY || [];
  const compactions= window.COMPACTIONS_DETAIL || [];
  const subagents  = window.SUBAGENTS_DETAIL || [];

  const navItems = [
    { id: 'strat-panel', label: 'STRAT' },
    { id: 'econ-panel', label: 'ECON' },
    { id: 'tool-panel', label: 'TOOLS' },
    { id: 'compaction-panel', label: 'CMPCT' },
    { id: 'subagents-panel', label: 'AGENTS' },
    { id: 'raw-panel', label: 'RAW' },
  ];

  function jumpTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const root = document.querySelector('.scroll-root') || window;
    if (root === window) {
      window.scrollTo({ top: el.offsetTop - 60, behavior: 'smooth' });
    } else {
      root.scrollTo({ top: el.offsetTop - root.offsetTop - 8, behavior: 'smooth' });
    }
  }

  return (
    <>
      <div className="detail-jump">
        <span className="detail-jump-lbl">JUMP</span>
        {navItems.map(n => (
          <button key={n.id} className="detail-jump-btn" onClick={() => jumpTo(n.id)}>
            {n.label}
          </button>
        ))}
      </div>

      <div className="panel" id="strat-panel">
        <div className="panel-head">
          <span>CONTEXT WINDOW · STRATIGRAPHY</span>
          <span style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
            <span className="est" style={{ marginRight: 12 }}>~ESTIMATED</span>
            <div className="seg">
              <button className={`btn ${mode==='cumulative'?'active':''}`} onClick={() => setMode('cumulative')}>Cumulative</button>
              <button className={`btn ${mode==='incremental'?'active':''}`} onClick={() => setMode('incremental')}>Incremental</button>
            </div>
          </span>
        </div>
        <div className="panel-body" style={{ paddingBottom: 0 }}>
          <window.StratigraphyChart snapshots={CONTEXT_SNAPSHOTS} compactions={COMPACTIONS} mode={mode} />
        </div>
        <div className="legend">
          {Object.keys(window.CAT_LABELS).map(k => (
            <span key={k}><span className="d" style={{ background: window.CAT_COLORS[k] }}/>{window.CAT_LABELS[k]}</span>
          ))}
        </div>
      </div>

      <div className="detail-grid">
        <div className="panel" style={{ borderBottom: 0 }}>
          <div className="panel-head"><span>SESSION STATS</span></div>
          <div className="panel-body">
            <div className="stat-grid">
              {[
                ['SESSION_ID  ', session.sessionId, ''],
                ['MODEL       ', session.model, 'cyan'],
                ['PROJECT     ', session.project, 'amber'],
                ['STARTED     ', fmtTimeAgo(session.startTime), 'muted'],
                ['DURATION    ', fmtDuration(session.durationMs), 'muted'],
                ['API CALLS   ', String(session.apiCalls), ''],
                ['TOKENS IN   ', fmtTokens(session.totalInputTokens), ''],
                ['TOKENS OUT  ', fmtTokens(session.totalOutputTokens), ''],
                ['CACHE READ  ', fmtTokens(session.totalCacheReadTokens), 'green'],
                ['HIT RATE    ', ((session.totalCacheReadTokens/session.totalInputTokens)*100).toFixed(1) + '%', 'cyan'],
                ['COST        ', fmtCost(session.totalCost), 'green'],
                ['COMPACTIONS ', String(compactions.length), 'amber'],
              ].map(([k,v,cls],i) => (
                <div key={i} className="row">
                  <span className="k">{k}</span>
                  <span className={`v ${cls}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="panel" style={{ borderBottom: 0 }}>
          <div className="panel-head"><span>QUICK READ</span></div>
          <div className="panel-body">
            <window.TokenBars session={session} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span>MESSAGE THREAD</span><span className="est">scroll for analytics ↓</span></div>
        <window.MessageThread events={window.THREAD_EVENTS} onInspectCompaction={(e) => setInspecting(e)} />
      </div>

      <window.TokenEconomicsPanel session={session} apiCalls={apiCalls} perModel={perModel} />

      <window.ToolEffectivenessPanel calls={toolCalls} summaries={toolSummary} />

      <window.CompactionAnalyticsPanel
        compactions={compactions}
        snapshots={CONTEXT_SNAPSHOTS}
        apiCalls={apiCalls}
        onInspect={(c) => setInspecting(window.THREAD_EVENTS.find(e => e.role === 'compaction') || c)}
      />

      <window.SubagentsPanel summaries={subagents} />

      <window.RawDataExplorer />

      {inspecting && (
        <window.CompactionInspector
          event={window.COMPACTION_EVENT}
          preBuckets={window.PRE_BUCKETS}
          postBuckets={window.POST_BUCKETS}
          summaryText={window.SUMMARY_TEXT}
          losses={window.LOSSES}
          onClose={() => setInspecting(null)}
        />
      )}
    </>
  );
}

window.SessionDetail = SessionDetail;
