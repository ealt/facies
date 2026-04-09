# Style Guide

This document defines the code formatting and style conventions for Facies.

## Code Formatting

### General

- Indentation: tabs (Svelte/HTML), tabs (TypeScript)
- Use trailing commas in multiline structures
- End files with a single newline
- Use single quotes for strings

### TypeScript

- Strict mode enabled
- Explicit return types on exported functions
- Use `interface` for object shapes, `type` for unions and aliases
- Prefer `const` over `let`; never use `var`

### Svelte

- Svelte 5 runes only (`$state`, `$derived`, `$props`, `$effect`)
- No legacy reactive syntax (`$:`, `export let`, stores)
- Props: `let { prop }: { prop: Type } = $props()`
- Derived: `const x = $derived(expr)` or `$derived.by(() => { ... })`

## Naming Conventions

### Files

| Type | Convention | Example |
|------|-----------|---------|
| Svelte components | PascalCase | `TokenEconomicsView.svelte` |
| TypeScript modules | kebab-case | `session-aggregator.ts` |
| Test files | kebab-case + `.test.ts` | `conversation-builder.test.ts` |
| Chart components | PascalCase | `DailyUsageChart.svelte` |

### Variables and Functions

- Variables: `camelCase`
- Functions: `camelCase`, verb-first for actions (`computeTokenEconomics`, `formatDuration`)
- Constants: `UPPER_SNAKE_CASE` for true constants (`INDEX_VERSION`)
- Booleans: prefix with `is`, `has`, `should`, `can` (`isError`, `hasTranscript`, `isSynthetic`)

### Types and Interfaces

- Interfaces: `PascalCase`, noun-based (`SessionSummary`, `TokenSnapshot`)
- Type unions: `PascalCase` (`TranscriptRecord`, `EventLogRecord`)
- Enum-like unions: string literal types (`ContextCategory`)

## Documentation

### Comments

- Use comments to explain "why", not "what"
- JSDoc `/** */` on exported functions and interfaces
- Inline `//` for non-obvious logic within functions
- No comments on self-evident code

## Patterns

### Preferred Patterns

**Analysis modules as pure functions:**
```typescript
export function computeMetric(inputs: InputType): OutputType {
  // Pure transformation, no side effects
}
```

**Chart component structure:**
```svelte
<script lang="ts">
  let { data }: { data: DataType } = $props();
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  let containerWidth = $state(600);
  const scale = $derived(d3.scaleLinear()...);
</script>
<div bind:clientWidth={containerWidth}>
  {#if data.length === 0}
    <div>No data</div>
  {:else}
    <svg>...</svg>
  {/if}
</div>
```

### Patterns to Avoid

**Do not use Svelte 4 syntax:**
```svelte
// Avoid:
export let prop;
$: derived = compute(prop);

// Use:
let { prop }: { prop: Type } = $props();
const derived = $derived(compute(prop));
```

**Do not mutate analysis inputs:**
```typescript
// Avoid:
function analyze(data: Item[]) {
  data.sort(...);  // mutates input
}

// Use:
function analyze(data: Item[]) {
  const sorted = [...data].sort(...);
}
```

## Linting Configuration

- `svelte-check` -- Svelte + TypeScript type checking (no separate ESLint config)
- `tsconfig.json` -- TypeScript strict mode, module resolution

### Key Rules

- **No unused variables**: enforced by TypeScript strict mode
- **No implicit any**: all types must be explicit at boundaries

## Running Linters

For commands to run linting and formatting, see [AGENTS.md](AGENTS.md#commands).
