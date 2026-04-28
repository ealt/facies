// CompactionInspector.jsx — overlay that drills into a single compaction event.
// Three-pane forensic view: PRE (what was in context) → SUMMARY (what replaced it) → POST (what's left).
// Triggered from the thread by clicking the compaction divider.

const fmtTok = n => {
  if (typeof n !== 'number') return n;
  if (n >= 1_000_000) return (n/1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n/1_000).toFixed(n >= 10_000 ? 0 : 1) + 'k';
  return String(n);
};
const fmtPct = (a, b) => ((a/b)*100).toFixed(1) + '%';

const FATE_COLOR = {
  kept:        'var(--signal-green)',
  summarized:  'var(--signal-amber)',
  dropped:     'var(--signal-red)',
  new:         'var(--signal-cyan)',
};
const FATE_GLYPH = { kept: '●', summarized: '◐', dropped: '○', new: '✦' };

function BucketRow({ bucket, total, side }) {
  const pct = (bucket.tokens / total) * 100;
  return (
    <div className="cb-row" data-fate={bucket.fate}>
      <div className="cb-row-head">
        <span className="cb-fate" style={{ color: FATE_COLOR[bucket.fate] }} title={bucket.fate}>
          {FATE_GLYPH[bucket.fate]}
        </span>
        <span className="cb-label">{bucket.label}</span>
        <span className="cb-tokens">{fmtTok(bucket.tokens)}</span>
        <span className="cb-pct">{pct.toFixed(1)}%</span>
      </div>
      <div className="cb-bar">
        <div className="cb-bar-fill" style={{ width: pct + '%', background: FATE_COLOR[bucket.fate] }} />
      </div>
      <div className="cb-sample">
        {typeof bucket.items === 'number' && <span className="cb-items">{bucket.items}×</span>}
        {bucket.sample}
      </div>
    </div>
  );
}

function StackedBar({ buckets, total }) {
  return (
    <div className="cb-stack">
      {buckets.map((b, i) => (
        <div key={i}
             className="cb-stack-seg"
             title={`${b.label} — ${fmtTok(b.tokens)} (${((b.tokens/total)*100).toFixed(1)}%)`}
             style={{
               width: ((b.tokens/total)*100) + '%',
               background: FATE_COLOR[b.fate],
               opacity: b.fate === 'dropped' ? 0.5 : (b.fate === 'summarized' ? 0.75 : 1),
             }} />
      ))}
    </div>
  );
}

function CompactionInspector({ event, preBuckets, postBuckets, summaryText, losses, onClose }) {
  // Esc to dismiss
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lostTotal = event.preTokens - event.postTokens;

  return (
    <div className="ci-backdrop" onClick={onClose}>
      <div className="ci-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ci-head">
          <div className="ci-head-left">
            <span className="ci-head-tag">COMPACTION INSPECTOR</span>
            <span className="ci-head-sep">›</span>
            <span className="ci-head-id">api_call&nbsp;<b>{event.apiCall}</b></span>
            <span className="ci-head-sep">·</span>
            <span className="ci-head-id">session&nbsp;<b>{event.sessionId}</b></span>
          </div>
          <button className="ci-close" onClick={onClose} title="Close (Esc)">×</button>
        </div>

        {/* Topline metrics */}
        <div className="ci-metrics">
          <div className="ci-metric">
            <div className="ci-metric-l">BEFORE</div>
            <div className="ci-metric-v">{fmtTok(event.preTokens)}</div>
            <div className="ci-metric-s">tokens · {preBuckets.length} buckets</div>
          </div>
          <div className="ci-metric ci-arrow">→</div>
          <div className="ci-metric">
            <div className="ci-metric-l">SUMMARY</div>
            <div className="ci-metric-v amber">{fmtTok(event.summaryTokens)}</div>
            <div className="ci-metric-s">model-generated</div>
          </div>
          <div className="ci-metric ci-arrow">→</div>
          <div className="ci-metric">
            <div className="ci-metric-l">AFTER</div>
            <div className="ci-metric-v">{fmtTok(event.postTokens)}</div>
            <div className="ci-metric-s">tokens · {postBuckets.length} buckets</div>
          </div>
          <div className="ci-metric ci-spacer" />
          <div className="ci-metric">
            <div className="ci-metric-l">REDUCTION</div>
            <div className="ci-metric-v red">−{(event.ratio*100).toFixed(1)}%</div>
            <div className="ci-metric-s">{fmtTok(lostTotal)} cleared</div>
          </div>
          <div className="ci-metric">
            <div className="ci-metric-l">DURATION</div>
            <div className="ci-metric-v">{(event.durationMs/1000).toFixed(1)}s</div>
            <div className="ci-metric-s">{event.triggerReason}</div>
          </div>
        </div>

        {/* Visual diff: stacked bars showing PRE vs POST proportions */}
        <div className="ci-diff">
          <div className="ci-diff-row">
            <div className="ci-diff-lbl">BEFORE · {fmtTok(event.preTokens)}</div>
            <StackedBar buckets={preBuckets} total={event.preTokens} />
          </div>
          <div className="ci-diff-row">
            <div className="ci-diff-lbl">AFTER  · {fmtTok(event.postTokens)}</div>
            <div className="ci-diff-row-after">
              <StackedBar buckets={postBuckets} total={event.preTokens} />
              <div className="ci-diff-after-spacer" />
            </div>
          </div>
          <div className="ci-diff-legend">
            <span><span className="d" style={{ background: FATE_COLOR.kept }}/>kept verbatim</span>
            <span><span className="d" style={{ background: FATE_COLOR.summarized }}/>folded into summary</span>
            <span><span className="d" style={{ background: FATE_COLOR.dropped }}/>dropped</span>
            <span><span className="d" style={{ background: FATE_COLOR.new }}/>new (summary)</span>
          </div>
        </div>

        {/* Three-column body */}
        <div className="ci-body">

          {/* PRE column */}
          <div className="ci-col">
            <div className="ci-col-head">
              <span className="ci-col-tag">BEFORE</span>
              <span className="ci-col-meta">{fmtTok(event.preTokens)} · {preBuckets.length} buckets</span>
            </div>
            <div className="ci-col-body">
              {preBuckets.map((b, i) => (
                <BucketRow key={i} bucket={b} total={event.preTokens} side="pre" />
              ))}
            </div>
          </div>

          {/* SUMMARY column */}
          <div className="ci-col">
            <div className="ci-col-head">
              <span className="ci-col-tag amber">SUMMARY</span>
              <span className="ci-col-meta">{fmtTok(event.summaryTokens)} · model-generated</span>
            </div>
            <div className="ci-col-body ci-summary-body">
              <div className="ci-summary-meta">
                <div className="ci-summary-row"><span className="k">replaces</span><span className="v">{fmtTok(event.preTokens - event.postTokens + event.summaryTokens)}</span></div>
                <div className="ci-summary-row"><span className="k">compression</span><span className="v">{(((event.preTokens - event.postTokens) / event.summaryTokens) || 1).toFixed(1)}×</span></div>
                <div className="ci-summary-row"><span className="k">format</span><span className="v">prose · ~{Math.round(event.summaryTokens/0.75)} chars</span></div>
              </div>
              <div className="ci-summary-text">
                {summaryText.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </div>
          </div>

          {/* POST column */}
          <div className="ci-col">
            <div className="ci-col-head">
              <span className="ci-col-tag">AFTER</span>
              <span className="ci-col-meta">{fmtTok(event.postTokens)} · {postBuckets.length} buckets</span>
            </div>
            <div className="ci-col-body">
              {postBuckets.map((b, i) => (
                <BucketRow key={i} bucket={b} total={event.postTokens} side="post" />
              ))}
              <div className="ci-headroom">
                <div className="ci-headroom-l">HEADROOM</div>
                <div className="ci-headroom-bar">
                  <div className="ci-headroom-fill" style={{ width: ((event.postTokens / 1_280_000) * 100) + '%' }} />
                </div>
                <div className="ci-headroom-meta">
                  <span>{fmtTok(event.postTokens)} / 1.28M used</span>
                  <span>{fmtTok(1_280_000 - event.postTokens)} free</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Losses footer */}
        <div className="ci-losses">
          <div className="ci-losses-head">
            <span>WHAT WAS LOST</span>
            <span className="ci-losses-meta">{fmtTok(lostTotal)} tokens removed · ranked by weight</span>
          </div>
          <div className="ci-losses-body">
            {losses.map((l, i) => {
              const pct = (l.tokens / lostTotal) * 100;
              return (
                <div key={i} className="ci-loss-row">
                  <div className="ci-loss-bar">
                    <div className="ci-loss-bar-fill" style={{ width: pct + '%' }} />
                  </div>
                  <div className="ci-loss-tok">{fmtTok(l.tokens)}</div>
                  <div className="ci-loss-pct">{pct.toFixed(1)}%</div>
                  <div className="ci-loss-label">{l.label}</div>
                  <div className="ci-loss-note">{l.note}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer hint strip */}
        <div className="ci-foot">
          <span><kbd>Esc</kbd> close</span>
          <span><kbd>←</kbd>/<kbd>→</kbd> prev/next compaction</span>
          <span><kbd>R</kbd> view raw</span>
          <span><kbd>S</kbd> share link</span>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>compaction 1 of 1 in this session</span>
        </div>

      </div>
    </div>
  );
}

window.CompactionInspector = CompactionInspector;
