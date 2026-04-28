// ProjectView.jsx — drill-down for a single project.
// Shows: KPI strip · 30-day cost trend · file heatmap · task breakdown · sessions table.

const fmtMoney = n => '$' + (n < 1 ? n.toFixed(2) : n.toFixed(2));
const fmtCalls = n => n >= 1000 ? (n/1000).toFixed(1) + 'k' : String(n);

// ─── 30-day cost trend chart (mini-stratigraphy) ──────────────────────────
function CostTrendChart({ series, height = 180, alertThreshold }) {
  const maxCost = Math.max(...series.map(d => d.cost), 0.01);
  const W = 1000;
  const H = height;
  const PAD_L = 48, PAD_R = 12, PAD_T = 12, PAD_B = 24;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const barW = innerW / series.length;
  const x = i => PAD_L + i * barW;
  const y = v => PAD_T + innerH - (v / maxCost) * innerH;

  // 7-day moving avg overlay
  const avg = series.map((_, i) => {
    const w = series.slice(Math.max(0, i - 6), i + 1);
    return w.reduce((s, d) => s + d.cost, 0) / w.length;
  });

  const ticks = 4;
  const yLabels = Array.from({ length: ticks + 1 }, (_, i) => (maxCost * i / ticks));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
      {/* Y-axis grid + labels */}
      {yLabels.map((v, i) => {
        const yy = y(v);
        return (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={yy} y2={yy} stroke="var(--border)" strokeDasharray={i === 0 ? '' : '2 3'} />
            <text x={PAD_L - 6} y={yy + 3} textAnchor="end" fontSize="10" fill="var(--ink-3)" fontFamily="var(--font-mono)">{fmtMoney(v)}</text>
          </g>
        );
      })}

      {/* Alert threshold (daily budget proxy) */}
      {alertThreshold && alertThreshold < maxCost && (
        <g>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(alertThreshold)} y2={y(alertThreshold)}
                stroke="var(--signal-red)" strokeDasharray="4 3" opacity="0.6" />
          <text x={W - PAD_R - 4} y={y(alertThreshold) - 4} textAnchor="end" fontSize="9"
                fill="var(--signal-red)" fontFamily="var(--font-mono)" letterSpacing="0.5">
            ALERT {fmtMoney(alertThreshold)}
          </text>
        </g>
      )}

      {/* Bars */}
      {series.map((d, i) => {
        const h = (d.cost / maxCost) * innerH;
        const over = alertThreshold && d.cost >= alertThreshold;
        return (
          <rect key={i}
                x={x(i) + 1.5} y={y(d.cost)}
                width={Math.max(1, barW - 3)} height={h}
                fill={over ? 'var(--signal-red)' : 'var(--signal-amber)'}
                opacity={over ? 0.85 : 0.78}>
            <title>{d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {fmtMoney(d.cost)} · {d.sessions} sessions</title>
          </rect>
        );
      })}

      {/* 7-day moving average line */}
      <polyline
        points={series.map((_, i) => `${x(i) + barW/2},${y(avg[i])}`).join(' ')}
        fill="none" stroke="var(--signal-cyan)" strokeWidth="1.5" />

      {/* X-axis labels — every 5 days */}
      {series.map((d, i) => {
        if (i % 5 !== 0 && i !== series.length - 1) return null;
        return (
          <text key={i} x={x(i) + barW/2} y={H - 8} textAnchor="middle"
                fontSize="9" fill="var(--ink-3)" fontFamily="var(--font-mono)">
            {d.d === 0 ? 'today' : `-${d.d}d`}
          </text>
        );
      })}
    </svg>
  );
}

// ─── File heatmap ────────────────────────────────────────────────────────
function FileHeatmap({ files }) {
  const max = Math.max(...files.map(f => f.costShare), 0.01);
  return (
    <table className="file-heat">
      <tbody>
        {files.map((f, i) => (
          <tr key={i}>
            <td className="fh-path">{f.path}</td>
            <td className="fh-bar">
              <div className="fh-bar-track">
                <div className="fh-bar-fill" style={{ width: ((f.costShare / max) * 100) + '%' }} />
              </div>
            </td>
            <td className="fh-share">{(f.costShare * 100).toFixed(1)}%</td>
            <td className="fh-meta">{f.edits}e · {f.reads}r</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Task type breakdown ─────────────────────────────────────────────────
function TaskBreakdown({ tasks }) {
  const totalCost = tasks.reduce((s, t) => s + t.count * t.avgCost, 0);
  return (
    <div className="task-bd">
      {tasks.map((t, i) => {
        const cost = t.count * t.avgCost;
        const share = (cost / totalCost) * 100;
        return (
          <div key={i} className="task-row">
            <div className="task-row-head">
              <span className="task-label">{t.label}</span>
              <span className="task-count">{t.count}× · avg {fmtMoney(t.avgCost)}</span>
            </div>
            <div className="task-bar">
              <div className="task-bar-fill" style={{ width: share + '%' }} />
            </div>
            <div className="task-cost">{fmtMoney(cost)}<span className="task-pct"> {share.toFixed(0)}%</span></div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────
function ProjectView({ project, onSelectSession, onBack }) {
  const series = window.PROJECT_SERIES[project.id]?.series || [];
  const totals = window.PROJECT_SERIES[project.id]?.totals || {};
  const projectSessions = window.SESSIONS.filter(s => s.project === project.id);
  const fileHeat = window.FILE_HEAT[project.id] || [];
  const tasks = window.PROJECT_TASKS[project.id] || [];

  const dailyAlert = project.budget * project.alert / 30; // alert when daily cost > X
  const cumCost = totals.cost || 0;
  const budgetUsed = cumCost / project.budget;

  return (
    <>
      {/* Project header strip */}
      <div className="project-header">
        <div className="project-header-main">
          <span className="project-id">PROJECT</span>
          <span className="project-name">{project.label}</span>
          {project.active
            ? <span className="project-status active">ACTIVE</span>
            : <span className="project-status idle">IDLE</span>}
          <span className="project-desc">{project.description}</span>
        </div>
        <div className="project-header-meta">
          <span><span className="k">REPO</span> <span className="v">{project.repo}</span></span>
          <span><span className="k">SESSIONS</span> <span className="v">{projectSessions.length}</span></span>
          <span><span className="k">LAST ACTIVE</span> <span className="v">{projectSessions[0] ? window.fmtTimeAgo(projectSessions[0].startTime) : 'never'}</span></span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpis">
        <div className="kpi">
          <div className="l">30-DAY SPEND</div>
          <div className="v amber">{fmtMoney(cumCost)}</div>
          <div className="sub">of {fmtMoney(project.budget)} budget</div>
        </div>
        <div className="kpi">
          <div className="l">BUDGET USED</div>
          <div className={`v ${budgetUsed >= project.alert ? 'red' : budgetUsed >= 0.6 ? 'amber' : 'green'}`}>
            {(budgetUsed * 100).toFixed(0)}%
          </div>
          <div className="sub">{budgetUsed >= project.alert ? '⚠ over alert threshold' : 'on track'}</div>
        </div>
        <div className="kpi">
          <div className="l">SESSIONS</div>
          <div className="v">{totals.sessions || 0}</div>
          <div className="sub">{(totals.sessions / 30).toFixed(1)}/day avg</div>
        </div>
        <div className="kpi">
          <div className="l">CACHE HIT</div>
          <div className="v cyan">{(totals.hitRate || 0).toFixed(1)}%</div>
          <div className="sub">{window.fmtTokens(totals.cacheTokens || 0)} cached</div>
        </div>
        <div className="kpi">
          <div className="l">AVG / SESSION</div>
          <div className="v">{fmtMoney(totals.avgCostPerSession || 0)}</div>
          <div className="sub">last 30d</div>
        </div>
        <div className="kpi">
          <div className="l">API CALLS</div>
          <div className="v">{fmtCalls(totals.calls || 0)}</div>
          <div className="sub">{Math.round((totals.calls || 0) / 30)}/day</div>
        </div>
      </div>

      {/* 30-day trend */}
      <div className="panel">
        <div className="panel-head">
          <span>COST TREND · 30 DAYS</span>
          <span className="est" style={{ display: 'inline-flex', gap: 14 }}>
            <span><span className="d" style={{ background: 'var(--signal-amber)' }}/>daily cost</span>
            <span><span className="d" style={{ background: 'var(--signal-cyan)' }}/>7-day avg</span>
            <span><span className="d" style={{ background: 'var(--signal-red)' }}/>alert threshold</span>
          </span>
        </div>
        <div className="panel-body">
          <CostTrendChart series={series} alertThreshold={dailyAlert} />
        </div>
      </div>

      {/* Two-column: file heat + tasks */}
      <div className="detail-grid">
        <div className="panel" style={{ borderBottom: 0 }}>
          <div className="panel-head"><span>FILE HEATMAP · TOP COST CONTRIBUTORS</span><span className="est">last 30d</span></div>
          <div className="panel-body" style={{ padding: 0 }}>
            <FileHeatmap files={fileHeat} />
          </div>
        </div>
        <div className="panel" style={{ borderBottom: 0 }}>
          <div className="panel-head"><span>TASK BREAKDOWN</span></div>
          <div className="panel-body">
            <TaskBreakdown tasks={tasks} />
          </div>
        </div>
      </div>

      {/* Sessions table — filtered to this project */}
      <div className="panel">
        <div className="panel-head">
          <span>SESSIONS IN {project.label.toUpperCase()}</span>
          <span className="est">{projectSessions.length} rows</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>TITLE</th>
              <th>MODEL</th>
              <th>STARTED ▼</th>
              <th className="r">TOKENS</th>
              <th className="r">CACHE %</th>
              <th className="r">CALLS</th>
              <th className="r">COST</th>
            </tr>
          </thead>
          <tbody>
            {projectSessions.map(s => {
              const hit = (s.totalCacheReadTokens / s.totalInputTokens) * 100;
              return (
                <tr key={s.sessionId} onClick={() => onSelectSession(s)}>
                  <td>{s.title}  <span style={{ color: 'var(--ink-3)', fontSize: 10, marginLeft: 6 }}>{s.sessionId}</span></td>
                  <td><span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--tracked-tight)', textTransform: 'uppercase' }}>{s.model.replace('claude-3-5-', '').replace('claude-3-', '')}</span></td>
                  <td>{window.fmtTimeAgo(s.startTime)}</td>
                  <td className="r">{window.fmtTokens(s.totalInputTokens + s.totalOutputTokens)}</td>
                  <td className="r" style={{ color: hit > 70 ? 'var(--signal-green)' : 'var(--ink-2)' }}>{hit.toFixed(0)}%</td>
                  <td className="r">{s.apiCalls}</td>
                  <td className="r" style={{ color: 'var(--signal-green)' }}>{fmtMoney(s.totalCost)}</td>
                </tr>
              );
            })}
            {projectSessions.length === 0 && (
              <tr><td colSpan="7" style={{ color: 'var(--ink-3)', padding: 24, textAlign: 'center' }}>no sessions in last 30 days</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

window.ProjectView = ProjectView;
