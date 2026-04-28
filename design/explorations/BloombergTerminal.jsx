// Bloomberg Terminal — pure black, mono everywhere, amber accent, dense info.
const BT_TOKENS = {
  bg: '#000000',
  bg2: '#0a0a0a',
  border: '#1f1f1f',
  border2: '#2a2a2a',
  ink: '#e5e5e5',
  ink2: '#888888',
  ink3: '#555555',
  amber: '#ffb000',
  amber2: '#ff8800',
  green: '#00d97e',
  red: '#ff4d4d',
  cyan: '#5dd9e0',
  mono: '"IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace',
};

function BloombergTerminal() {
  const t = BT_TOKENS;
  const Cell = ({ children, ...p }) => <div {...p} style={{ ...p.style }}>{children}</div>;
  return (
    <div style={{ width: 1280, height: 760, background: t.bg, color: t.ink, fontFamily: t.mono, fontSize: 12 }}>
      {/* Top status bar */}
      <div style={{ height: 24, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${t.border}`, fontSize: 10, color: t.ink2 }}>
        <span style={{ background: t.amber, color: t.bg, padding: '4px 10px', fontWeight: 700, letterSpacing: '0.1em' }}>FACIES</span>
        <span style={{ padding: '0 12px' }}>SES&lt;GO&gt;</span>
        <span style={{ padding: '0 12px', borderLeft: `1px solid ${t.border}` }}>CTX&lt;GO&gt;</span>
        <span style={{ padding: '0 12px', borderLeft: `1px solid ${t.border}` }}>ECON&lt;GO&gt;</span>
        <span style={{ padding: '0 12px', borderLeft: `1px solid ${t.border}` }}>COMP&lt;GO&gt;</span>
        <div style={{ flex: 1 }} />
        <span style={{ padding: '0 12px', color: t.amber }}>14:32:07 UTC</span>
        <span style={{ padding: '0 12px', borderLeft: `1px solid ${t.border}` }}>~/.claude/projects</span>
      </div>

      {/* Title row */}
      <div style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: `1px solid ${t.border}`, gap: 24, fontSize: 11 }}>
        <span style={{ color: t.amber }}>SESSION OVERVIEW</span>
        <span style={{ color: t.ink2 }}>N=7</span>
        <span style={{ color: t.ink2 }}>Σ TOK <span style={{ color: t.ink }}>13.9M</span></span>
        <span style={{ color: t.ink2 }}>Σ COST <span style={{ color: t.green }}>$24.63</span></span>
        <span style={{ color: t.ink2 }}>HIT% <span style={{ color: t.cyan }}>80.2</span></span>
        <span style={{ color: t.ink2 }}>SAVED <span style={{ color: t.green }}>$28.48</span></span>
        <div style={{ flex: 1 }} />
        <span style={{ color: t.ink3 }}>F1 HELP · F4 EXPORT · F8 FILTER</span>
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 280px', height: 704 }}>
        {/* LEFT: session list */}
        <div style={{ borderRight: `1px solid ${t.border}`, overflow: 'auto' }}>
          <div style={{ padding: '6px 12px', borderBottom: `1px solid ${t.border}`, color: t.amber, fontSize: 10, letterSpacing: '0.1em' }}>SESSIONS · ↓ TOK</div>
          {[
            ['*','3f2a8b1e','facies','3.2M','$6.21'],
            [' ','7a1c4f92','facies','2.1M','$4.04'],
            [' ','2e9f7b61','garth','4.2M','$7.82'],
            [' ','9d4e2a17','facies','1.1M','$2.18'],
            [' ','1a6f9e22','facies','1.8M','$3.12'],
            [' ','5b8d1c34','karya','540K','$0.94'],
            [' ','8c3a5d47','eden','210K','$0.32'],
          ].map((r,i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '14px 90px 1fr 60px 60px',
              padding: '5px 12px', fontSize: 11, gap: 6,
              background: r[0]==='*' ? `${t.amber}14` : 'transparent',
              borderLeft: r[0]==='*' ? `2px solid ${t.amber}` : '2px solid transparent',
            }}>
              <span style={{ color: t.amber }}>{r[0]}</span>
              <span style={{ color: t.ink }}>{r[1]}</span>
              <span style={{ color: t.cyan, fontSize: 10 }}>{r[2]}</span>
              <span style={{ textAlign: 'right', color: t.ink2 }}>{r[3]}</span>
              <span style={{ textAlign: 'right', color: t.green }}>{r[4]}</span>
            </div>
          ))}
        </div>

        {/* CENTER: stratigraphy */}
        <div>
          <div style={{ padding: '6px 12px', borderBottom: `1px solid ${t.border}`, color: t.amber, fontSize: 10, letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between' }}>
            <span>CONTEXT WINDOW · STRATIGRAPHY · 3F2A8B1E</span>
            <span style={{ color: t.ink3 }}>~ESTIMATED</span>
          </div>
          <svg width="100%" height="320" viewBox="0 0 640 320" preserveAspectRatio="none" style={{ display: 'block' }}>
            {[0,0.25,0.5,0.75,1].map((p,i) => (
              <line key={i} x1="40" x2="630" y1={290-p*260} y2={290-p*260} stroke={t.border} strokeWidth="1"/>
            ))}
            {[0,93,186,279,373].map((v,i) => (
              <text key={i} x="36" y={290-i/4*260+3} textAnchor="end" fontSize="9" fill={t.ink3} fontFamily={t.mono}>{v}K</text>
            ))}
            {/* layers — flat-shaded, no transparency */}
            <path d="M40,290 L630,290 L630,275 L40,275 Z" fill={t.ink3}/>
            <path d="M40,275 L320,275 L320,180 Q200,170 100,190 L40,200 Z" fill={t.cyan}/>
            <path d="M40,200 L100,190 Q200,170 320,180 L320,130 Q200,120 100,140 L40,150 Z" fill={t.green}/>
            <path d="M340,275 L630,275 L630,255 Q500,250 400,260 L340,265 Z" fill={t.amber2}/>
            <path d="M340,265 L400,260 Q500,250 630,255 L630,180 Q500,170 400,185 L340,195 Z" fill={t.cyan}/>
            <path d="M340,195 L400,185 Q500,170 630,180 L630,140 Q500,130 400,150 L340,160 Z" fill={t.green}/>
            <path d="M340,160 L400,150 Q500,130 630,140 L630,110 Q500,105 400,120 L340,130 Z" fill={t.amber}/>
            <line x1="330" y1="20" x2="330" y2="290" stroke={t.red} strokeWidth="1" strokeDasharray="2 3"/>
            <text x="334" y="32" fill={t.red} fontSize="9" fontFamily={t.mono}>COMPACT 1.18M→340K (-71%)</text>
            <text x="40" y="310" fontSize="9" fill={t.ink3} fontFamily={t.mono}>API 0</text>
            <text x="630" y="310" textAnchor="end" fontSize="9" fill={t.ink3} fontFamily={t.mono}>59</text>
          </svg>
          <div style={{ padding: '6px 12px', borderTop: `1px solid ${t.border}`, fontSize: 10, color: t.ink2, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {[['SYS',t.ink3],['USR',t.cyan],['ASST',t.green],['TOOL',t.amber2],['CMP',t.amber]].map(([l,c]) => (
              <span key={l}><span style={{ display: 'inline-block', width: 8, height: 8, background: c, marginRight: 4 }}/>{l}</span>
            ))}
          </div>

          {/* Token bars */}
          <div style={{ padding: '6px 12px', borderTop: `1px solid ${t.border}`, color: t.amber, fontSize: 10, letterSpacing: '0.1em' }}>TOKEN ECONOMICS · 3F2A8B1E</div>
          <div style={{ padding: 12, fontSize: 11 }}>
            {[
              ['FRESH IN ', '412K',  0.13, t.red],
              ['CACHE RD ', '2.6M',  0.81, t.green],
              ['CACHE WR ', '188K',  0.06, t.amber],
              ['OUTPUT   ', '180K',  0.06, t.cyan],
            ].map(([l,v,w,c],i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ color: t.ink2 }}>{l}</span>
                <span style={{ display: 'block', height: 12, background: t.border, position: 'relative' }}>
                  <span style={{ display: 'block', height: '100%', width: `${w*100}%`, background: c }}/>
                </span>
                <span style={{ textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: stats */}
        <div style={{ borderLeft: `1px solid ${t.border}` }}>
          <div style={{ padding: '6px 12px', borderBottom: `1px solid ${t.border}`, color: t.amber, fontSize: 10, letterSpacing: '0.1em' }}>SESSION STATS</div>
          <div style={{ padding: 12, fontSize: 11, lineHeight: 1.7 }}>
            {[
              ['SESSION_ID  ','3f2a8b1e', t.ink],
              ['MODEL       ','sonnet-3.5', t.cyan],
              ['PROJECT     ','facies', t.cyan],
              ['STARTED     ','12m ago', t.ink2],
              ['DURATION    ','14m', t.ink2],
              ['API CALLS   ','42', t.ink],
              ['TOKENS IN   ','3.2M', t.ink],
              ['TOKENS OUT  ','180K', t.ink],
              ['CACHE READ  ','2.6M', t.green],
              ['HIT RATE    ','81.3%', t.cyan],
              ['COST        ','$6.21', t.green],
              ['COMPACTIONS ','1', t.amber],
            ].map(([k,v,c],i) => (
              <div key={i} style={{ display: 'flex', borderBottom: `1px dotted ${t.border}`, padding: '2px 0' }}>
                <span style={{ color: t.ink3, whiteSpace: 'pre' }}>{k}</span>
                <span style={{ flex: 1, textAlign: 'right', color: c }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '6px 12px', borderTop: `1px solid ${t.border}`, color: t.amber, fontSize: 10, letterSpacing: '0.1em' }}>QUERY</div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ background: t.bg2, border: `1px solid ${t.border2}`, padding: 8, fontSize: 10, color: t.amber }}>
              <span style={{ color: t.ink3 }}>&gt; </span>
              project = "facies"<br/>
              <span style={{ color: t.ink3 }}>&nbsp; AND</span> total_tokens &gt; 1M
            </div>
            <div style={{ marginTop: 6, fontSize: 9, color: t.green }}>3 ROWS · 6.4M TOK · $12.43</div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.BloombergTerminal = BloombergTerminal;
