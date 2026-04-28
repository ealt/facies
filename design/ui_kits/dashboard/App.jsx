// App.jsx — root router: overview · detail · project
function computeTotals(sessions) {
  const cost = sessions.reduce((s,x)=>s+x.totalCost,0);
  const inTok = sessions.reduce((s,x)=>s+x.totalInputTokens,0);
  const cacheRead = sessions.reduce((s,x)=>s+x.totalCacheReadTokens,0);
  const calls = sessions.reduce((s,x)=>s+x.apiCalls,0);
  const tokens = sessions.reduce((s,x)=>s+x.totalInputTokens+x.totalOutputTokens,0);
  const hitRate = inTok ? (cacheRead / inTok) * 100 : 0;
  const saved = (cacheRead - cacheRead * 0.10) * (3 / 1_000_000);
  return { cost, inTok, cacheRead, calls, tokens, hitRate, saved, avg: calls ? cost/calls : 0 };
}

function App() {
  const [view, setView] = useState('overview');
  const [session, setSession] = useState(null);
  const [project, setProject] = useState(null);
  const [t, setTweak] = window.useTweaks(window.TWEAK_DEFAULTS);

  // Apply tweaks to <body> as data attrs — CSS handles the rest.
  React.useEffect(() => {
    document.body.dataset.accent = t.accent;
    document.body.dataset.mono = t.mono;
    document.body.dataset.density = t.density;
  }, [t.accent, t.mono, t.density]);

  const totals = useMemo(() => computeTotals(SESSIONS), []);
  const sessionCount = SESSIONS.length;

  const onSelectSession = s => { setSession(s); setView('detail'); };
  const onSelectProject = p => { setProject(p); setView('project'); };
  const onBack = () => {
    // Back from session detail goes to project view if we came from there, else overview.
    if (view === 'detail' && project) setView('project');
    else { setView('overview'); setSession(null); setProject(null); }
  };

  // expose onSelectProject globally so anywhere a project pill is rendered can dispatch
  React.useEffect(() => {
    window.__navigateToProject = (id) => {
      const p = window.PROJECTS.find(x => x.id === id);
      if (p) onSelectProject(p);
    };
    window.__navigateToView = (v) => {
      if (v === 'overview') { setView('overview'); setSession(null); setProject(null); }
      else if (v === 'detail' && session) { setView('detail'); }
    };
  }, [session]);

  // Global "back" event from KeyboardController (Esc)
  React.useEffect(() => {
    const onBackEvt = () => onBack();
    window.addEventListener('facies:back', onBackEvt);
    return () => window.removeEventListener('facies:back', onBackEvt);
  }, [view, project]);

  // Cycle through visible sessions while in detail view ([ / ])
  const cycleSession = (delta) => {
    if (view !== 'detail' || !session) return;
    const list = SESSIONS;
    const idx = list.findIndex(s => s.sessionId === session.sessionId);
    if (idx === -1) return;
    const next = list[(idx + delta + list.length) % list.length];
    setSession(next);
  };

  return (
    <div className="app">
      <window.KeyboardController
        view={view}
        hasSelection={!!session}
        onSetView={(v) => { setView(v); if (v === 'overview') { setSession(null); setProject(null); } }}
        onClearSelection={() => { setSession(null); setProject(null); }}
        onCycleSession={cycleSession}
      />
      <Header
        view={view}
        session={session}
        project={project}
        onBack={onBack}
        totals={totals}
        sessionCount={sessionCount}
      />
      <main>
        {view === 'overview' && (
          <Overview totals={totals} onSelect={onSelectSession} selectedId={session?.sessionId} />
        )}
        {view === 'detail' && (
          <SessionDetail session={session} />
        )}
        {view === 'project' && (
          <window.ProjectView
            project={project}
            onSelectSession={onSelectSession}
            onBack={() => { setView('overview'); setProject(null); }}
          />
        )}
      </main>
      <window.TweaksPanel title="TWEAKS">
        <window.TweakSection label="Accent" />
        <window.TweakRadio
          label="Signal color" value={t.accent}
          options={[
            { value: 'amber',   label: 'Amber' },
            { value: 'cyan',    label: 'Cyan' },
            { value: 'magenta', label: 'Mag.' },
            { value: 'lime',    label: 'Lime' },
          ]}
          onChange={(v) => setTweak('accent', v)}
        />
        <window.TweakSection label="Typography" />
        <window.TweakRadio
          label="Mono font" value={t.mono}
          options={[
            { value: 'ibm-plex',  label: 'Plex' },
            { value: 'jetbrains', label: 'JB' },
          ]}
          onChange={(v) => setTweak('mono', v)}
        />
        <div style={{ font: 'var(--xsmall)', color: 'var(--ink-3)', padding: '0 12px 8px', lineHeight: 1.4 }}>
          Affects only monospace text — values, IDs, code, file paths.<br/>
          Labels and headings stay sans (IBM Plex Sans).
        </div>
        <window.TweakSection label="Density" />
        <window.TweakRadio
          label="Row height" value={t.density}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'regular', label: 'Regular' },
            { value: 'comfy',   label: 'Comfy' },
          ]}
          onChange={(v) => setTweak('density', v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
