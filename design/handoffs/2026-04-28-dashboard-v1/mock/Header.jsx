// Header.jsx — Bloomberg-style status bar + title row
function Header({ view, session, project, onBack, totals, sessionCount }) {
  const [time, setTime] = React.useState(() => fmtClock());
  React.useEffect(() => {
    const id = setInterval(() => setTime(fmtClock()), 1000);
    return () => clearInterval(id);
  }, []);

  const navItems = [
    ['SES', 'Sessions', view === 'overview', () => window.__navigateToView('overview'), true],
    ['CTX', 'Context',  view === 'detail',   () => window.__navigateToView('detail'),   !!session],
    ['ECON','Economics', false, null, false],
    ['COMP','Compactions', false, null, false],
    ['TOOL','Tool Use', false, null, false],
  ];

  return (
    <>
      <div className="status-bar">
        <span className="brand">FACIES</span>
        <div className="nav">
          {navItems.map(([k,l,active,onClick,enabled]) => (
            <button
              key={k}
              className={active ? 'active' : (enabled ? '' : 'disabled')}
              onClick={enabled ? onClick : undefined}
              disabled={!enabled}
              title={enabled ? l : `${l} — not implemented`}
            >
              {k}<span className="key">&lt;GO&gt;</span>
            </button>
          ))}
        </div>
        <div className="meta">
          <span className="clock">{time}</span>
          <span>~/.claude/projects</span>
        </div>
      </div>

      <div className="title-row">
        {view === 'overview' && (
          <>
            <span className="crumb">SESSION OVERVIEW</span>
            <span className="stat"><span className="muted-2">N</span><b>{sessionCount}</b></span>
            <span className="stat"><span className="muted-2">Σ TOK</span><b>{fmtTokens(totals.tokens)}</b></span>
            <span className="stat"><span className="muted-2">Σ COST</span><b className="green">{fmtCost(totals.cost)}</b></span>
            <span className="stat"><span className="muted-2">HIT%</span><b className="cyan">{totals.hitRate.toFixed(1)}</b></span>
            <span className="stat"><span className="muted-2">SAVED</span><b className="green">{fmtCost(totals.saved)}</b></span>
          </>
        )}
        {view === 'detail' && session && (
          <>
            <span className="crumb">
              <button onClick={onBack} className="icon-btn" title="back" style={{ marginRight: 6 }}>
                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M6 1L2 5l4 4" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
              </button>
              SES
              <span className="sep">›</span>
              <span style={{ color: 'var(--ink)' }}>{session.sessionId}</span>
            </span>
            <span className="stat"><span className="muted-2">TITLE</span><b>{session.title}</b></span>
            <span className="stat"><span className="muted-2">MODEL</span><span style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 'var(--tracked-tight)' }}>{session.model}</span></span>
            <span className="stat" onClick={() => window.__navigateToProject(session.project)} style={{ cursor: 'pointer' }}><span className="muted-2">PROJ</span><span className="pill amber">{session.project}</span></span>
          </>
        )}
        {view === 'project' && project && (
          <>
            <span className="crumb">
              <button onClick={onBack} className="icon-btn" title="back" style={{ marginRight: 6 }}>
                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M6 1L2 5l4 4" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
              </button>
              PROJ
              <span className="sep">›</span>
              <span style={{ color: 'var(--ink)' }}>{project.label}</span>
            </span>
            <span className="stat"><span className="muted-2">REPO</span><b>{project.repo}</b></span>
            <span className="stat"><span className="muted-2">STATUS</span><b className={project.active ? 'green' : 'muted-2'}>{project.active ? 'ACTIVE' : 'IDLE'}</b></span>
          </>
        )}
        <span className="keys">F1 HELP · F4 EXPORT · F8 FILTER</span>
      </div>
    </>
  );
}

function fmtClock() {
  const d = new Date();
  return d.toUTCString().slice(17, 25) + ' UTC';
}

window.Header = Header;
