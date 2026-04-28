# Design ↔ Code Sync — Facies dashboard

This folder is the design source-of-truth for the Facies UI. It is committed alongside
the implementation so design state is versionable, blameable, and reviewable next to
code changes.

## What lives here

| Path                       | Purpose                                                                                       |
|----------------------------|-----------------------------------------------------------------------------------------------|
| `README.md`                | Design system reference: tokens, type, voice, visual rules.                                   |
| `SKILL.md`                 | Operating instructions for AI tooling working on this project.                                |
| `colors_and_type.css`      | The canonical token sheet. **Both the design mock and the real app should consume this.**     |
| `ui_kits/dashboard/`       | Live, interactive HTML mock of the dashboard. Open `index.html` in a browser to interact.    |
| `landing.html`             | Marketing site mock.                                                                          |
| `cli_mocks.html`           | Terminal output mocks in the same visual language.                                            |
| `comparison.html`          | Two-session side-by-side comparison view.                                                     |
| `snapshots/`               | Frozen, self-contained HTML exports for stakeholder review. One file per design milestone.   |
| `handoffs/`                | Per-feature implementation briefs. One folder per handoff to engineering.                    |
| `assets/`                  | Logos, glyphs, mark variants, exported SVGs.                                                  |
| `explorations/`            | Discarded directions kept for reference. Not canonical.                                       |
| `preview/`                 | Cards rendered for the design-system review tab. Not part of the product.                     |
| `CHANGELOG.md`             | Human-written log of design decisions. Update on every meaningful push.                       |

## The round-trip

The design tool produces this folder. Claude Code consumes it. Updates flow both ways.

### Design → code

1. Iterate in the design tool until the mock reflects the desired state.
2. Update `CHANGELOG.md` with a one-paragraph entry: what changed, what it implies for
   the implementation, what's still open.
3. Export a snapshot into `snapshots/` for the milestone (see below).
4. Download the project zip and commit this folder to the repo.
5. In a Claude Code session, point at this folder and the changelog entry. Claude Code
   reads the JSX/CSS in `ui_kits/dashboard/` directly to lift exact values rather than
   inferring from screenshots.

### Code → design

1. When the implementation lands a UI change, update the corresponding mock file in
   `ui_kits/dashboard/` to match. This is a chore, not optional — drift compounds.
2. If `colors_and_type.css` changes in code, propagate it back to this folder in the
   same PR.
3. Add a `CHANGELOG.md` entry describing the design's new ground-truth.

### When in doubt about which side is canonical

- **Tokens, type, voice:** this folder. Code consumes from here.
- **Component structure & data plumbing:** code. The mock is a shape, not an
  architecture.
- **Copy strings:** this folder for the dashboard chrome (panel titles, tab labels,
  empty-state text). Code for runtime strings (error messages with substituted values,
  loading messages tied to async state).

## Snapshots

A snapshot is a self-contained, offline-viewable HTML file frozen at a milestone. It
is not an editing surface — it is a record. Anyone can open it years later without
running the project.

### Naming

`snapshots/YYYY-MM-DD-<surface>-v<n>.html`

Examples:

- `snapshots/2026-04-28-dashboard-v1.html`
- `snapshots/2026-05-12-dashboard-v2.html`
- `snapshots/2026-05-15-landing-v1.html`

Bump `v<n>` only when the design has shipped or been formally reviewed. Working
iterations don't need snapshots.

### How to create one

In the design tool, ask: "snapshot the dashboard as `snapshots/<filename>.html`."
The tool will inline all assets and produce a single file. Commit it.

## Handoffs

A handoff is the artifact passed to engineering when a surface is ready to build. It
sits next to a snapshot of the same date — the snapshot is **what it looks like**, the
handoff is **what to do about it**.

### Structure

`handoffs/YYYY-MM-DD-<surface>-v<n>/`

Each folder contains:

- `README.md` — the spec. Self-sufficient: an engineer who wasn't in any design
  conversation should be able to read it and start implementing. Includes layout,
  components, tokens, interactions, fidelity statement (what's pixel-exact vs.
  illustrative), and open questions.
- The HTML mock files for the surface(s) being handed off. Copies, not symlinks —
  the handoff is frozen at the moment it was made.
- Any feature-specific assets the spec references.

### Lifecycle

- Once committed, a handoff is **read-only**. Don't edit it after the fact.
- To revise, generate a new dated handoff and update `CHANGELOG.md` so engineers
  see which one is current.
- After a handoff has shipped, move it to `handoffs/archive/` so the top level only
  shows active work.
- See `handoffs/README.md` for the full naming convention and active index.

## Open design questions

Carry these forward in `CHANGELOG.md` until resolved. Keep them visible — they are
the highest-leverage conversations between design and engineering.

- Is the `colors_and_type.css` token set going to be imported directly into the real
  app, or duplicated and kept in sync manually?
- The mock currently uses fixture data. The real app needs loaders, errors, and empty
  states for every panel. Spec these per panel as they ship.
- Logo and wordmark are present in `assets/` but not yet referenced from the code.
- Density and accent are exposed as live tweaks here; should they be user
  preferences in the real app, or fixed defaults?
