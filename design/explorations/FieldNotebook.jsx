// Field Notebook — warm dark canvas, sepia/ochre palette, serif display + mono everywhere else.
// Brand affect: USGS field report. Data as observation.

const FN_TOKENS = {
  bg: '#1a1612',
  bg2: '#221d18',
  paper: '#2a241e',
  border: '#3a3128',
  ink: '#e8dfd2',
  ink2: '#a89c89',
  ink3: '#6b614f',
  ochre: '#c89b4a',
  rust: '#b85c3c',
  moss: '#7a8c5c',
  slate: '#6b7e8a',
  serif: '"Lora", "Iowan Old Style", "Source Serif 4", Georgia, serif',
  mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
};

function FieldNotebook() {
  const t = FN_TOKENS;
  return (
    <div style={{
      width: 1280, height: 760, background: t.bg, color: t.ink,
      fontFamily: t.mono, fontSize: 13, padding: 0, position: 'relative',
      backgroundImage: `repeating-linear-gradient(0deg, transparent 0 31px, rgba(232,223,210,0.04) 31px 32px)`,
    }}>
      {/* Header */}
      <header style={{
        height: 56, display: 'flex', alignItems: 'center', padding: '0 24px',
        borderBottom: `1px solid ${t.border}`, background: t.bg, gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 24 24">
            <rect x="3" y="3"  width="18" height="3" fill={t.ochre} />
            <rect x="3" y="7"  width="18" height="2" fill={t.rust} />
            <rect x="3" y="10" width="18" height="4" fill={t.moss} />
            <rect x="3" y="15" width="18" height="2" fill={t.slate} />
            <rect x="3" y="18" width="18" height="3" fill={t.ink2} opacity="0.5" />
          </svg>
          <span style={{ fontFamily: t.serif, fontSize: 22, fontWeight: 500, fontStyle: 'italic', letterSpacing: '0.01em' }}>Facies</span>
        </div>
        <span style={{ color: t.ink3, fontSize: 11, marginLeft: 16, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Field Survey · 2026.04.24</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: t.ink2, fontSize: 12 }}>7 sessions · last loaded 2m ago</span>
      </header>

      <div style={{ padding: 24 }}>
        {/* Title block */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: t.ink3, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Observation log</div>
          <h1 style={{ fontFamily: t.serif, fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>Stratigraphic survey</h1>
          <div style={{ color: t.ink2, fontSize: 13, marginTop: 4, fontStyle: 'italic', fontFamily: t.serif }}>seven sessions across four projects · 13.9M tokens · $24.63</div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            ['Total Cost', '$24.63', null],
            ['Cache Hit Rate', '80.2%', '+2.1pp from prior'],
            ['Saved by Caching', '$28.48', t.moss],
            ['Avg Cost/Call', '$0.133', null],
          ].map(([l, v, sub], i) => (
            <div key={i} style={{ background: t.paper, border: `1px solid ${t.border}`, borderRadius: 2, padding: '14px 16px' }}>
              <div style={{ color: t.ink3, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{l}</div>
              <div style={{ fontFamily: t.serif, fontSize: 28, fontWeight: 500, marginTop: 4, color: i===2 ? t.moss : t.ink }}>{v}</div>
              {sub && <div style={{ fontSize: 10, color: t.ink2, marginTop: 2 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Chart */}
        <div style={{ background: t.paper, border: `1px solid ${t.border}`, borderRadius: 2, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: t.serif, fontSize: 18, fontWeight: 500 }}>Plate I — Context window strata</div>
              <div style={{ color: t.ink3, fontSize: 11, fontStyle: 'italic', fontFamily: t.serif }}>session 3f2a8b1e · 60 api calls · one unconformity observed</div>
            </div>
            <div style={{ display: 'flex', gap: 0, border: `1px solid ${t.border}` }}>
              <button style={{ padding: '4px 12px', fontSize: 11, background: t.ochre, color: t.bg, border: 0, fontFamily: t.mono, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cumulative</button>
              <button style={{ padding: '4px 12px', fontSize: 11, background: 'transparent', color: t.ink2, border: 0, fontFamily: t.mono, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Incremental</button>
            </div>
          </div>
          <svg width="100%" height="240" viewBox="0 0 1180 240" preserveAspectRatio="none">
            {[0,0.25,0.5,0.75,1].map((p,i) => (
              <line key={i} x1="50" x2="1170" y1={210-p*200} y2={210-p*200} stroke={t.border} strokeWidth="1"/>
            ))}
            {[0,0.25,0.5,0.75,1].map((p,i) => (
              <text key={i} x="44" y={210-p*200+3} textAnchor="end" fontSize="9" fill={t.ink3} fontFamily={t.mono}>{Math.round(p*375)}K</text>
            ))}
            <path d="M50,210 L1170,210 L1170,180 L50,180 Z" fill={t.slate} opacity="0.85"/>
            <path d="M50,180 L560,180 L560,90 Q400,80 200,100 L50,110 Z" fill="#5e7d99" opacity="0.85"/>
            <path d="M50,110 L200,100 Q400,80 560,90 L560,40 Q400,30 200,55 L50,70 Z" fill={t.moss} opacity="0.85"/>
            <path d="M580,180 L1170,180 L1170,160 Q900,150 700,165 L580,170 Z" fill={t.ochre} opacity="0.9"/>
            <path d="M580,170 L700,165 Q900,150 1170,160 L1170,90 Q900,80 700,95 L580,100 Z" fill="#5e7d99" opacity="0.85"/>
            <path d="M580,100 L700,95 Q900,80 1170,90 L1170,55 Q900,45 700,62 L580,68 Z" fill={t.moss} opacity="0.85"/>
            <path d="M580,68 L700,62 Q900,45 1170,55 L1170,38 Q900,30 700,40 L580,46 Z" fill={t.rust} opacity="0.85"/>
            <line x1="568" y1="20" x2="568" y2="210" stroke={t.rust} strokeWidth="1.5" strokeDasharray="3 4"/>
            <text x="572" y="32" fill={t.rust} fontSize="10" fontStyle="italic" fontFamily={t.serif}>unconformity · 1.2M → 340K</text>
            <text x="50" y="232" fontSize="9" fill={t.ink3} fontFamily={t.mono}>0</text>
            <text x="1170" y="232" textAnchor="end" fontSize="9" fill={t.ink3} fontFamily={t.mono}>59</text>
          </svg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, fontSize: 10, color: t.ink2 }}>
            {[['System',t.slate],['User','#5e7d99'],['Assistant',t.moss],['Tool Results',t.ochre],['Compacted',t.rust]].map(([l,c])=>(
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 4, background: c }}/>{l}
              </span>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: t.paper, border: `1px solid ${t.border}`, borderRadius: 2 }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.border}`, background: t.bg2 }}>
                {['Title','Project','Model','Started','Tokens','Cost'].map((h,i) => (
                  <th key={i} style={{
                    padding: '10px 16px', fontSize: 10, fontWeight: 500, color: t.ink3,
                    letterSpacing: '0.14em', textTransform: 'uppercase', textAlign: i>=4?'right':'left',
                    fontFamily: t.mono,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['refactor session-loader','facies','sonnet','12m','3.2M','$6.21'],
                ['add compaction analyzer','facies','sonnet','2h','2.1M','$4.04'],
                ['fix cache rate calc','facies','haiku','3d','1.1M','$2.18'],
                ['scaffold marketing site','garth','sonnet','6d','4.2M','$7.82'],
              ].map((r,i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${t.border}` }}>
                  <td style={{ padding: '10px 16px', fontFamily: t.serif, fontSize: 14, fontStyle: 'italic' }}>{r[0]}</td>
                  <td style={{ padding: '10px 16px' }}><span style={{ fontFamily: t.mono, fontSize: 10, padding: '2px 6px', background: t.bg, color: t.ochre, border: `1px solid ${t.border}` }}>{r[1]}</span></td>
                  <td style={{ padding: '10px 16px', color: t.ink2, fontSize: 11 }}>{r[2]}</td>
                  <td style={{ padding: '10px 16px', color: t.ink3 }}>{r[3]} ago</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: t.mono }}>{r[4]}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: t.mono, color: t.ochre }}>{r[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

window.FieldNotebook = FieldNotebook;
