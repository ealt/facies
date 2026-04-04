# Facies — Naming Document

## The Name

**Facies** (pronounced FAY-sheez, rhymes with "phases")

A geological term for the distinctive character of a rock unit that
distinguishes it from adjacent units. In stratigraphy, facies analysis
classifies regions of accumulated material by their observable
characteristics — composition, texture, structure — to reconstruct the
history of how they formed.

From Latin *facies*: "face, appearance, form."

## Why Facies

The tool analyzes Claude Code sessions by decomposing the context window
into its constituent layers. Each layer has a different character: system
prompts at the base, user messages, assistant responses, tool results
interspersed like sediment, compaction events cutting across like
unconformities. The tool classifies these regions by their observable
characteristics — token count, cost, latency, type — to reconstruct
what happened during the session.

This is literally facies analysis, applied to context windows instead of
rock formations.

## Branding

**Tagline:** Context window stratigraphy.

**Short description:** Session analytics for Claude Code. Facies
analyzes the layers of your context window — what fills it, what it
costs, and how compaction reshapes it.

**Elevator pitch:** Every Claude Code session builds up invisible
layers — system prompts at the base, conversation accreting on top, tool
results interspersed, compaction events cutting across like
unconformities. Facies makes these layers visible. It's a local web UI
that parses your session transcripts and event logs, then renders the
context window as a decomposed timeline: what filled each layer, how
fast it grew, what it cost, and what survived compaction. Think Chrome
DevTools Network tab, but for the internal structure and token economics
of AI coding sessions.

## How the Name Was Chosen

### Process

The naming exploration started with three broad source territories:

1. **Scientific instruments** — spectroscopy, chromatography,
   tomography, and other instruments whose purpose is decomposing
   complex signals into constituent parts
2. **Optics and observation** — terms for revealing hidden structure in
   transparent or opaque media (schlieren imaging, dispersion, etc.)
3. **Forensics and archaeological analysis** — stratigraphy, taphonomy,
   trace analysis, and other terms for reconstructing history from
   layered evidence

Research into how successful observability tools got their names
(Splunk, Grafana, Sentry, Prometheus, Tableau, etc.) revealed that the
strongest names encode a *user experience metaphor* rather than a
technical description. Splunk doesn't describe log indexing — it
describes what it feels like to use the tool (spelunking through data
caves).

**Stratigraphy** emerged as the strongest metaphorical territory: the
context window is literally a stratigraphy — layers of material
accumulating over time, with compaction boundaries marking dramatic
transitions. From there, **facies** stood out as the more specific and
more interesting term: it's not just that the context window has layers,
but that each layer has a different *character* that can be classified
and analyzed.

### Candidates Considered

From the scientific instruments territory:

- **Spectrograph / spectrometer** — strong decomposition metaphor, but
  generic and heavily used in software naming
- **Tomograph** — "slicing open" an opaque object, good metaphor but
  medical connotation dominates
- **Plethysmograph** — "fullness-writer," records filling and emptying
  over time — excellent metaphor but unwieldy name
- **Schlieren** — optical technique for visualizing density in
  transparent media — precise metaphor but pronunciation barrier

From the geological/archaeological territory:

- **Strata** — instantly understood, but heavily occupied (OpenGamma
  Strata on GitHub, Strata Decision Technology, Strata.io, strata.com).
  SEO would be impossible.
- **Palimpsest** — text scraped and overwritten with traces remaining
  (compaction metaphor) — too literary, 3 syllables
- **Sondage** — archaeological test trench through layers — too obscure
  even for the technical vibe
- **Facies** — distinctive character of a layer, classified by
  observable properties. Available namespace, precise metaphor, right
  length.

### Why Facies Won

| Criterion            | Assessment                                             |
| -------------------- | ------------------------------------------------------ |
| Metaphor precision   | Exact — classifying regions by observable character     |
| Vibe                 | Technical, precise, scientific — as requested           |
| Length               | 6 characters, 2 syllables                              |
| Pronounceability     | FAY-sheez — natural after hearing once                  |
| Searchability        | No software competitors. Googleable on day one.         |
| npm                  | Reclaimable (archived, 1 star, 96 dl/week)             |
| GitHub               | No prominent repos using the bare name                  |
| Commercial collision | None                                                   |
| Domain availability  | facies.dev likely available                             |

## Geological Glossary (for Reference)

Terms from the metaphor that may appear in the UI or documentation:

- **Facies** — the distinctive character of a unit, classified by
  observable properties
- **Stratigraphy** — the study of layers and their chronological
  sequence
- **Strata** — the layers themselves (plural of stratum)
- **Unconformity** — a boundary representing a gap in the record
  (compaction events)
- **Outcrop** — where buried layers become visible at the surface
- **Accretion** — gradual accumulation of material (context growth)
- **Diagenesis** — transformation of material after deposition
  (compaction/summarization)
