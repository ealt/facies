// Minimap — cartographic, high contrast, layered translucency, restrained palette.
// Cool dark with single hue family. The chart IS the brand.
const MM_TOKENS = {
  bg: '#0c0e10',
  bg2: '#13161a',
  paper: '#1a1d22',
  border: '#262a30',
  border2: '#3a3f47',
  ink: '#f0f2f5',
  ink2: '#9ca3af',
  ink3: '#555a63',
  // single-hue: teal/cyan family
  c1: '#14b8a6',
  c2: '#0ea5e9',
  c3: '#6366f1',
  c4: '#8b5cf6',
  c5: '#ec4899',
  warn: '#f59e0b',
  err: '#f43f5e',
  sans: '"Inter Tight", "Söhne", -apple-system, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

function Minimap() {
  const t = MM_TOKENS;
  return (
    <div style={{ width: 1280, height: 760, background: t.bg, color: t.ink, fontFamily: t.sans, fontSize: 13 }}>
      {/* Header */}
      <header style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: `1px solid ${t.border}`, gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 20 20">
            <rect x="2" y="3"  width="16" height="2" fill={t.c1}/>
            <rect x="2" y="6"  width="16" height="2" fill={t.c2} opacity="0.85"/>
            <rect x="2" y="9"  width="16" height="2" fill={t.c3} opacity="0.7"/>
            <rect x="2" y="12" width="16" height="2" fill={t.c4} opacity="0.55"/>
            <rect x="2" y="15" width="16" height="2" fill={t.c5} opacity="0.4"/>
          </svg>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em' }}>Facies</span>
        </div>
        <nav style={{ display: 'flex', gap: 4, fontSize: 13 }}>
          {['Overview','Sessions','Economics','Compactions'].map((l,i)=>(
            <span key={l} style={{
              padding: '4px 10px', borderRadius: 4,
              background: i===0 ? t.paper : 'transparent',
              color: i===0 ? t.ink : t.ink2,
              fontWeight: i===0 ? 500 : 400,
            }}>{l}</span>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.ink2 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.c1 }}/>
          <span>7 sessions · 13.9M tokens</span>
        </div>
      </header>

      <div style={{ padding: 24 }}>
        {/* Hero metric strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 1, background: t.border, marginBottom: 24, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ background: t.bg, padding: '20px 24px' }}>
            <div style={{ fontSize: 11, color: t.ink2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Total spend · April</div>
            <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.03em', marginTop: 4 }}>$24.63</div>
            <div style={{ fontSize: 11, color: t.ink2, marginTop: 2 }}>across 7 sessions · 4 projects</div>
          </div>
          {[
            ['Cache hit rate', '80.2%', t.c1],
            ['Saved by caching', '$28.48', t.c1],
            ['Avg cost / call', '$0.133', t.ink],
            ['API calls', '185', t.ink],
          ].map(([l,v,c],i) => (
            <div key={i} style={{ background: t.bg, padding: '20px 20px' }}>
              <div style={{ fontSize: 11, color: t.ink2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{l}</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: c, marginTop: 6, letterSpacing: '-0.02em' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Main chart canvas */}
        <div style={{ background: t.paper, borderRadius: 8, padding: 24, marginBottom: 20, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: t.ink2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Session 3f2a8b1e</div>
              <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', marginTop: 2 }}>Context window over time</h2>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: 2, background: t.bg, borderRadius: 6 }}>
              {['Cumulative','Incremental'].map((l,i) => (
                <button key={l} style={{
                  padding: '4px 12px', fontSize: 12, fontWeight: 500, border: 0, borderRadius: 4, cursor: 'pointer',
                  background: i===0 ? t.border2 : 'transparent', color: i===0 ? t.ink : t.ink2,
                }}>{l}</button>
              ))}
            </div>
          </div>
          <svg width="100%" height="280" viewBox="0 0 1180 280" preserveAspectRatio="none">
            {/* very subtle grid */}
            {[0,0.25,0.5,0.75,1].map((p,i) => (
              <line key={i} x1="50" x2="1170" y1={250-p*240} y2={250-p*240} stroke={t.border} strokeWidth="1"/>
            ))}
            {[0,0.25,0.5,0.75,1].map((p,i) => (
              <text key={i} x="44" y={250-p*240+3} textAnchor="end" fontSize="10" fill={t.ink3} fontFamily={t.mono}>{Math.round(p*375)}K</text>
            ))}
            {/* layered translucency — single hue family */}
            <path d="M50,250 L1170,250 L1170,228 L50,228 Z" fill={t.ink3} opacity="0.5"/>
            <path d="M50,228 L560,228 L560,140 Q400,135 200,150 L50,160 Z" fill={t.c2} opacity="0.7"/>
            <path d="M50,160 L200,150 Q400,135 560,140 L560,80 Q400,75 200,98 L50,108 Z" fill={t.c1} opacity="0.7"/>
            <path d="M580,228 L1170,228 L1170,210 Q900,205 700,215 L580,220 Z" fill={t.c4} opacity="0.7"/>
            <path d="M580,220 L700,215 Q900,205 1170,210 L1170,140 Q900,128 700,150 L580,158 Z" fill={t.c2} opacity="0.7"/>
            <path d="M580,158 L700,150 Q900,128 1170,140 L1170,90 Q900,75 700,98 L580,106 Z" fill={t.c1} opacity="0.7"/>
            <path d="M580,106 L700,98 Q900,75 1170,90 L1170,55 Q900,45 700,60 L580,68 Z" fill={t.c3} opacity="0.7"/>
            {/* compaction marker — vertical band, not just a line */}
            <rect x="565" y="20" width="14" height="230" fill={t.err} opacity="0.08"/>
            <line x1="572" y1="20" x2="572" y2="250" stroke={t.err} strokeWidth="1.5"/>
            <circle cx="572" cy="20" r="3" fill={t.err}/>
            <text x="582" y="24" fill={t.err} fontSize="11" fontWeight="500" fontFamily={t.sans}>Compaction</text>
            <text x="582" y="38" fill={t.ink2} fontSize="10" fontFamily={t.mono}>1.18M → 340K · −71%</text>
            <text x="50" y="272" fontSize="10" fill={t.ink3} fontFamily={t.mono}>0</text>
            <text x="1170" y="272" textAnchor="end" fontSize="10" fill={t.ink3} fontFamily={t.mono}>api call 59</text>
          </svg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12, fontSize: 11, color: t.ink2 }}>
            {[['System',t.ink3],['User',t.c2],['Assistant',t.c1],['Tool results',t.c4],['Compacted',t.c3]].map(([l,c]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 3, background: c, opacity: 0.85, borderRadius: 1 }}/>{l}
              </span>
            ))}
          </div>
        </div>

        {/* Compact session strip */}
        <div style={{ background: t.paper, borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                {['Title','Project','Model','Started','Tokens','Cost'].map((h,i) => (
                  <th key={i} style={{
                    padding: '12px 20px', fontSize: 11, fontWeight: 500, color: t.ink2,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    textAlign: i>=4?'right':'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['refactor session-loader','facies', t.c1, 'sonnet','12m','3.2M','$6.21'],
                ['add compaction analyzer','facies', t.c1, 'sonnet','2h','2.1M','$4.04'],
                ['scaffold marketing site','garth',  t.c4, 'sonnet','6d','4.2M','$7.82'],
                ['fix cache rate calc','facies',     t.c1, 'haiku','3d','1.1M','$2.18'],
              ].map((r,i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${t.border}` }}>
                  <td style={{ padding: '14px 20px', fontWeight: 500 }}>{r[0]}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: r[2] }}/>{r[1]}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', color: t.ink2, fontFamily: t.mono, fontSize: 11 }}>{r[3]}</td>
                  <td style={{ padding: '14px 20px', color: t.ink2 }}>{r[4]} ago</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontFamily: t.mono, fontSize: 12 }}>{r[5]}</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontFamily: t.mono, fontSize: 12, fontWeight: 500 }}>{r[6]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

window.Minimap = Minimap;
