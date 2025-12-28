# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds app code; group by feature (`src/pages|routes` for screens, `src/components` for shared UI, `src/lib` for utilities).
- Static assets belong in `public/`; generated exports go to `dist/` or `tmp/` and stay out of git.
- `styles/` (or `src/styles`) keeps tokens and global CSS; co-locate component styles when small.
- Automation lives in `scripts/` (data conversion, sprite/badge builders) with a short usage note at the top.
- Tests sit in `tests/` and `e2e/` for browser flows; fixtures live in `tests/fixtures/`; docs/setup go to `docs/`.

## Build, Test, and Development Commands
- Node 18+ recommended. Install deps: `npm install` (or `pnpm install` per lockfile).
- Dev server: `npm run dev` (hot reload at the dev port).
- Production build: `npm run build`; verify with `npm run preview`.
- Quality gates: `npm run lint` (ESLint) and `npm run format` (Prettier).
- Tests: `npm run test` for unit/integration (Vitest/Jest style); `npm run test:e2e` for Playwright/browser checks.

## Coding Style & Naming Conventions
- 2-space indentation, trailing commas, semicolons; prefer `const`/`let`, avoid implicit globals.
- Components/hooks use `PascalCase`/`useCamelCase`; modules and files use `kebab-case` (`badge-controls.ts`).
- Keep JSX/TSX lean; extract shared UI to `src/components/`; use context hooks instead of deep prop chains.
- TypeScript: add explicit return types on exports; narrow `any` and validate external inputs.

## Testing Guidelines
- Name tests `*.test.ts[x]` or `*.spec.ts[x]` mirroring source layout.
- Target 80%+ coverage on new modules, especially rendering logic, payload formatting, and API helpers.
- Keep tests deterministic—mock network/time; reuse fixtures from `tests/fixtures/`.
- For UI, include at least one interaction test (clicks/forms) to lock behavior.

## Commit & Pull Request Guidelines
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`) with concise scopes.
- Run `npm run lint` and `npm run test` before pushing; attach screenshots or short clips for visual changes.
- PR template: purpose, key changes, local verification steps, linked issues, known follow-ups.
- Keep PRs small and focused; call out new dependencies or temporary skips/todos.

## Security & Configuration Tips
- Never commit secrets; load via `.env.local`/environment and document required keys in `docs/config.md`.
- Ignore build and coverage outputs (`dist/`, `.next/`, `coverage/`, `.vercel/`) and scrub device/analytics identifiers from sample data.
