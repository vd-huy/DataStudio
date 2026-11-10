# Table View Editing Toolbar, Row Highlighting, SQL Preview, and Page Size Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an intuitive TablePlus-style editing experience in DataStudio's Table View with double-click inline editing, high-contrast row highlighting for pending changes, a unified 7-function header toolbar (Refresh, Add, Delete, Revert, Preview SQL, Submit, Export), and a floating bottom Page Size pill with popover menu.

**Architecture:** Pure SQL statement generator (`previewSql.ts`) unit-tested with Vitest; CSS updates in `grid-changes.css` and `table-view.css` for row highlight and floating pill; Table View refactor (`tableView.ts`) to wire header actions and reactive change tracking without the legacy bottom pending bar.

**Tech Stack:** TypeScript, CodeMirror (for syntax/viewing), DOM helpers (`h`, `icon`, `showMenuBelow`), Vitest, CSS variables.

**Spec:** `docs/superpowers/specs/2026-11-10-tableview-editing-and-pagesize-design.md`

## Global Constraints
- Do not import engine-specific packages directly into shared UI (enforced by `architecture.test.ts`).
- Pure generation logic in `previewSql.ts` must use existing dialect and quoting utilities from `src/core/sql.ts`.
- Persist default page size to `localStorage` under key `datastudio.defaultPageSize`.

## Review Focus
- Primary-key-less tables: Ensure Preview SQL handles tables without primary keys gracefully (using all original comparable fields in the WHERE clause).
- Keyboard shortcuts: Ensure Ctrl+S / Cmd+S still triggers Submit and Escape/discard works smoothly.
- Zero-change state: Ensure Revert, Preview SQL, and Submit buttons are properly disabled when there are no pending changes.

---

### Task 1: Pure SQL Preview Generator (`previewSql.ts` and `previewSql.test.ts`)
- [ ] Write `src/features/table/previewSql.test.ts` testing SQL generation for INSERT, UPDATE, DELETE changes across dialects (`mysql`, `postgres`, `sqlite`).
- [ ] Create `src/features/table/previewSql.ts` using `quoteTable`, `quoteIdent`, and `valueLiteral` from `src/core/sql.ts`.
- [ ] Run `npm.cmd run test` to verify `previewSql.test.ts` passes.

### Task 2: High-Contrast Row Highlighting & Undo Icon
- [ ] In `src/core/dom.ts`, ensure `undo` icon exists in `ICONS`.
- [ ] In `src/styles/grid-changes.css`, update `.grid-table tr.state-modified` to highlight all cells in the row with a clear blue tone (`rgba(47, 111, 237, 0.22)` in light mode, `rgba(47, 111, 237, 0.32)` in dark mode) and cyan/accent fill on `.row-number`.
- [ ] In `src/styles/grid-changes.css`, update `.grid-table tr.state-new` (green tint) and `.grid-table tr.state-deleted` (red tint) for consistency.

### Task 3: Floating Bottom Page Size Pill
- [ ] In `src/styles/table-view.css`, add styles for `.table-page-size-pill` centered at the bottom of the table content.
- [ ] In `src/features/table/tableView.ts`, create the floating pill element and its popover menu (`Count Rows`, page size options `10, 100, 250, 500, 1000, All, Custom...`, and `Set as Default`).
- [ ] Wire loading and saving default page size to/from `localStorage`.
- [ ] Remove the obsolete `<select class="input page-size">` from the top toolbar.

### Task 4: Modernized Header Toolbar in TableView
- [ ] In `src/features/table/tableView.ts`, assemble the top toolbar: `Refresh`, `Add (+)` , `Delete (-)`, `Revert (↩)`, `Preview SQL (👁️)`, `Submit (💾/✓)`, `Export (📤)`.
- [ ] Wire `Preview SQL` to open a modal dialog displaying the formatted SQL with copy-to-clipboard functionality.
- [ ] Wire `Revert` to `this.grid.discard()`.
- [ ] Wire `Submit` to `this.submit()`.
- [ ] Dynamically update button states in `refreshButtons()`: disable Revert, Preview SQL, and Submit when `!hasChanges()`, and style Submit with primary/accent color when `hasChanges()` is true.
- [ ] Remove the legacy bottom `this.pendingBar`.

### Task 5: Verification and Code Quality
- [ ] Run `npm.cmd run typecheck` to confirm 0 TypeScript errors.
- [ ] Run `npm.cmd run test` to confirm all 55+ test suites pass.
- [ ] Run `npm.cmd run lint` to verify ESLint passes.
- [ ] Run `npm.cmd run format:check` to verify Prettier formatting.
