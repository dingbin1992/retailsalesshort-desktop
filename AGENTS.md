# AGENTS.md

## What This Is

Tauri v2 desktop app ("流向整理工具") that batch-processes Excel files from pharmaceutical distributors into a unified summary. Rust backend + Preact frontend + Node.js sidecar for Excel I/O.

## Architecture

```
src-tauri/src/lib.rs          ← Rust backend: Tauri commands, spawns Node sidecar
src/renderer/main.tsx          ← Main window (Preact, NOT React)
src/renderer/config-editor.tsx ← Pattern config editor page
src/renderer/tauri-bridge.ts   ← Bridges Tauri invoke → window.electronAPI
src/processing/cli.ts          ← Node.js sidecar entrypoint (Excel processing)
src/processing/excel-processor.ts ← Core processing logic
config/patterns.json           ← Runtime config: maps Excel columns → standard fields
```

The Rust side spawns `node dist/processing/cli.js` as a child process, passing a temp JSON config. Communication is via stdout JSON lines: `{type:"progress", event:{...}}` and `{type:"result", data:{...}}`.

## Build Commands

```bash
npm run build            # Full build: scripts → copy tauri api → bridge → cli → renderer
npm run tauri:dev        # Dev mode (starts Vite-like dev server on :1420)
npm run tauri:build:win  # Windows release build (outputs to releases/)
```

**Build order matters**: `build:scripts` must run first (compiles `scripts/*.ts` to `.js`), then `copy-tauri-api.js` copies Tauri API shims to `src/renderer/tauri-api/`.

## Critical: Generated Files (Gitignored)

These files are required at runtime but NOT in git — they are build artifacts:

- `scripts/*.js` — compiled from `.ts` by `npm run build:scripts`
- `src/renderer/tauri-bridge.js` — compiled from `.ts` by `npm run build:bridge`
- `src/renderer/tauri-api/` — copied by `scripts/copy-tauri-api.js`
- `dist/processing/cli.js` and `dist/processing/read-headers.js` — compiled from `src/processing/`

**Always run `npm run build` before `npm run tauri:dev`** if these are missing.

## Frontend: Preact, Not React

The renderer uses **Preact** (`preact` + `preact/hooks`), not React. JSX transform is configured with `--jsx-import-source=preact`. Do not import from `react` or `react-dom`.

The bridge exposes `window.electronAPI` — a legacy naming convention kept for compatibility. All Tauri invoke calls go through this interface.

## Config: patterns.json

`config/patterns.json` defines how each distributor's Excel columns map to standard fields:

| Value | Field |
|-------|-------|
| 1 | 日期 (Date) |
| 2 | 品种 (Product) |
| 3 | 规格 (Spec) |
| 4 | 批号 (Batch) |
| 5 | 流向单位 (Unit) |
| 6 | 数量 (Quantity) |

Keys in `headers` and `mapping` are string-encoded column numbers (e.g. `"3"` = column C).

## Node Sidecar

The app expects a portable Node.js at `node-portable/node.exe` (or `node` on PATH). Use `npm run download:node` to fetch it. The Rust backend checks `exe_dir/node-portable/` first, then falls back to system `node`.

## No Tests, Lint, or CI

There are no test suites, linter configs, or CI pipelines. Verification is manual: `npm run build` + `npm run tauri:dev`.

## Release Build

NSIS installer (per-machine, SimpChinese). Output goes to `releases/`. Build with `npm run tauri:build:win`.
