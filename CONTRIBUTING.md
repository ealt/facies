# Contributing to Facies

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd facies
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Ensure Claude Code logging hooks are configured so `~/.claude/logs/` contains session data. Facies reads session data from the local filesystem -- without logging hooks, there's nothing to analyze.

## Development Workflow

### Running the Dev Server

```bash
npm run dev
```

Opens at `http://localhost:5173`. The app reads session data from `~/.claude/` on the local machine.

### Running Tests

```bash
npm test
```

Tests use Vitest and run against fixture data in `tests/fixtures/`. No external dependencies or running services needed.

### Type Checking

```bash
npm run check
```

Runs `svelte-check` which validates both Svelte components and TypeScript files.

### Code Style

Follow our [Style Guide](STYLE_GUIDE.md) for formatting rules.

Key points:
- Svelte 5 runes only (no legacy syntax)
- Analysis functions must be pure
- Chart components follow the responsive SVG pattern

## Project Structure

See [AGENTS.md](AGENTS.md#architecture-overview) for the full architecture overview.

## Pull Request Process

1. Create a feature branch from `main`
2. Make changes and ensure tests pass (`npm test`)
3. Ensure type checking passes (`npm run check`)
4. Open a Pull Request against `main`

### PR Requirements

- [ ] Tests pass (`npm test`)
- [ ] Type checking passes (`npm run check`)
- [ ] New analysis modules have corresponding tests in `tests/`
- [ ] New views are wired into the session detail page

## Questions?

Open an issue for questions or suggestions.
