# Handoffs

Per-feature implementation briefs for engineering. Each folder is a frozen package:
the HTML mock at the moment of handoff, plus a `README.md` spec that an engineer can
build from without being in any design conversation.

## Naming

`YYYY-MM-DD-<surface>-v<n>/`

The date prefix sorts chronologically and pairs with `../snapshots/<same-prefix>.html`.
The version bumps when the same surface is handed off again with substantive changes.

Examples:

- `2026-04-28-dashboard-v1/` — initial dashboard build
- `2026-05-12-dashboard-v2/` — second pass after week-1 feedback
- `2026-05-20-comparison-v1/` — comparison view, first handoff

## Lifecycle

| Stage     | Where it lives                          |
|-----------|-----------------------------------------|
| Active    | `handoffs/<folder>/`                    |
| Shipped   | `handoffs/archive/<folder>/`            |
| Withdrawn | Delete; note in `../CHANGELOG.md` why.  |

Once a folder is committed, it is **read-only**. To revise: create a new dated handoff
and move the prior one to `archive/` once the new one supersedes it.

## What goes in a handoff folder

- `README.md` — the spec. Required. Sections:
  1. **Surface** — what UI is being handed off.
  2. **Scope & non-goals** — what's in, what's deliberately out.
  3. **Data shape** — types/contracts the surface depends on.
  4. **Layout** — component tree, dimensions, breakpoints.
  5. **Tokens** — which `colors_and_type.css` variables apply.
  6. **Interactions** — every user action and the resulting state change.
  7. **Edge cases** — empty, loading, error, overflow.
  8. **Fidelity** — what's pixel-exact vs. illustrative in the mock.
  9. **Open questions** — anything design hasn't resolved.
- The HTML mock files relevant to this surface. Copies, not references to live files.
- Feature-specific assets (images, JSON fixtures) the spec references.

## What does **not** go in a handoff folder

- The full project. Only the relevant surfaces.
- The design system reference (`colors_and_type.css`, `README.md`). Engineers consume
  those from the parent `design/` folder; handoffs reference them by name.
- Editing surfaces. The mock here is frozen — to iterate, work in
  `../ui_kits/<surface>/` and produce a new handoff when ready.

## Active handoffs

| Folder                                | Surface   | Status   |
|---------------------------------------|-----------|----------|
| `2026-04-28-dashboard-v1/`            | Dashboard | Active   |

## Archive

(empty — no handoffs have shipped yet)
