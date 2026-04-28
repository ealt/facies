# Snapshots

Frozen, self-contained HTML exports of the design at review milestones. Each file
is fully inlined — open it in any browser, offline, forever, without running the
project.

## What snapshots are for

- **Stakeholder review.** Send a single file. Anyone can open it.
- **Historical record.** The live mock keeps moving. Snapshots don't.
- **Regression reference.** "The dashboard looked like this on May 12" is sometimes
  the answer to "wait, when did we change the panel order?"

## What snapshots are NOT for

- Editing. The live mock under `ui_kits/dashboard/` is the editing surface.
- Daily iteration. Snapshot only at milestones.

## Naming

`YYYY-MM-DD-<surface>-v<n>.html`

- **YYYY-MM-DD** — date the snapshot was taken.
- **surface** — `dashboard`, `landing`, `cli`, `comparison`, etc.
- **v<n>** — design version. Bump when the design has shipped or been formally
  reviewed. Working iterations between milestones don't need their own snapshot.

## Adding a snapshot

In the design tool:

> snapshot the dashboard as `snapshots/2026-05-12-dashboard-v2.html`

The tool inlines all CSS, JS, fonts, and images into a single file. Commit it
to git like any other artifact.

## Index

| File                                  | Surface   | Notes                                |
|---------------------------------------|-----------|--------------------------------------|
| `2026-04-28-dashboard-v1.html`        | dashboard | First locked Bloomberg-Terminal pass |
