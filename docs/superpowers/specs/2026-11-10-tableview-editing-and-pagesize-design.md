# Design Document: Table View Editing Toolbar, Row Highlighting, SQL Preview, and Page Size Pill

**Date:** 2026-11-10  
**Status:** Approved by user  
**Author:** Antigravity  

---

## 1. Intent & Context

The user wants a streamlined, TablePlus-style workflow in DataStudio's **Table View** (`src/features/table/tableView.ts`):
1. **Immediate Inline Editing:** Double-clicking any cell in a row opens an inline editor directly for instant modifications.
2. **Distinct Row Highlight:** Modified rows must be highlighted with a prominent blue background across the entire row and a highlighted row-number badge (matching the visual style of TablePlus).
3. **Dedicated Header Toolbar:** A unified top header bar containing the core data editing and navigation actions in exact order:
   - `Refresh`
   - `Add row (+)`
   - `Delete row (-)`
   - `Revert changes (↩)`
   - `Preview SQL (👁️)`
   - `Submit / Save changes (💾/✓)`
   - `Export (📤)`
4. **Bottom Floating Page Size Pill (Position B):** A compact button at the bottom center of the table grid (`[ 100 rows ▾ ]`) that opens a popover menu with `Count Rows`, predefined page sizes (`10, 100, 250, 500 Default, 1.000, All, Custom...`), and `Set as Default` saved to `localStorage`.

---

## 2. Goals & Non-Goals

### Goals
- Modernize the Table View header to match the user's reference image (Image 3).
- Enable/disable pending-change buttons (`Revert`, `Preview SQL`, `Submit`) reactively based on whether `grid.hasChanges()` is true.
- Eliminate the disjointed bottom `pending-bar`, integrating save/revert actions directly into the primary header.
- Provide a "Preview SQL" modal that formats pending changes into standard SQL (`INSERT INTO`, `UPDATE ... WHERE`, `DELETE FROM ... WHERE`) adapted to the current engine dialect.
- Render prominent blue background highlighting for modified rows (`.state-modified`).
- Move the page size selector from the top toolbar `<select>` to a floating pill button at the bottom of the table grid, with full popup menu support and persistence.

### Non-Goals
- Editing arbitrary SQL query results in Query View (`resultArea.ts`) without primary key or origin metadata (scoped to Table View as selected by the user).
- Schema migrations or DDL generation beyond row data changes.

---

## 3. Approaches Considered

- **Approach 1 (Chosen): Streamlined TablePlus Style**
  - Consolidate all row operations (`Refresh`, `Add`, `Delete`, `Revert`, `Preview SQL`, `Submit`) directly in the Table View top header toolbar.
  - Position the Page Size pill at the bottom center of the grid table (Position B).
  - High-contrast blue highlight for modified rows and cyan/blue row-number badge.
  - Interactive Preview SQL modal with syntax-highlighted SQL.
  - *Trade-off:* Requires removing the legacy `pending-bar` and adjusting toolbar responsive wrapping.

- **Approach 2: Split Action Bar**
  - Keep save/revert actions in the bottom bar and only put Add/Delete/Refresh/Export at the top.
  - *Rejected:* User explicitly requested the complete 7-function header as shown in Image 3.

---

## 4. Technical Design Details

### 4.1. Header Toolbar in `tableView.ts`
The toolbar structure in `tableView.ts` will be updated to:
- **Left group:**
  - `Refresh` (`iconButton("refresh", "Refresh (F5)")`)
  - `separator()`
  - `Add row` (`iconButton("plus", "Add row")` - disabled if not editable)
  - `Delete row` (`iconButton("minus", "Delete selected row")` - disabled if not editable or no selection)
  - `Revert` (`iconButton("undo", "Revert changes")` - enabled only when `hasChanges`)
  - `Preview SQL` (`iconButton("query", "Preview SQL changes")` - enabled only when `hasChanges`)
  - `Submit` (`toolButton("check", "Save", ...)` - styled with accent/primary highlight when `hasChanges`, disabled otherwise)
  - `separator()`
  - Filter box / spacer
- **Right group (`toolbar-end`):**
  - `Export` dropdown button
  - `Columns` popover button
  - `Record` inspector toggle button
  - Page navigation buttons: `first`, `prev`, `pageInfo`, `next`, `last`

### 4.2. Bottom Page Size Pill (`tableView.ts`)
- Render a centered floating pill element `.table-page-size-pill` at the bottom of `this.content`:
  ```html
  <button class="page-size-pill" type="button">
    <span>100 rows</span>
    <span class="pill-chevron">▾</span>
  </button>
  ```
- Clicking opens a menu via `showMenuBelow` or popup with:
  1. `Count Rows` -> Triggers exact row counting (`reload({ ..., exact: true })`).
  2. `separator`
  3. Header title: `Page Size`
  4. Sizes: `10`, `100`, `250`, `500`, `1000`, `All` (`50000` limit), `Custom...` (prompts dialog to enter number).
  5. Checkmark (✓) for currently active size, and `Default` indicator for stored default size.
  6. `separator`
  7. `Set as Default` -> Writes `localStorage.setItem("datastudio.defaultPageSize", limit)` and toasts confirmation.
- On initialization, `this.limit` loads from `localStorage.getItem("datastudio.defaultPageSize")` or defaults to `200`.

### 4.3. Row Highlighting in `grid-changes.css`
Update CSS for `.grid-table`:
- `.grid-table tbody tr.state-modified td.cell`:
  `background: color-mix(in srgb, var(--ws-blue, #2f6fed) 22%, var(--surface)) !important;`
  (or `#1c355e` in dark mode, giving a clear TablePlus blue glow across all cells in the modified row).
- `.grid-table tbody tr.state-modified td.row-number`:
  `background: var(--accent, #2f6fed) !important; color: #ffffff !important; font-weight: 600;`
- `.grid-table tbody tr.state-new td.cell`:
  `background: color-mix(in srgb, var(--success, #1f9d55) 18%, var(--surface)) !important;`
- `.grid-table tbody tr.state-deleted td.cell`:
  `background: color-mix(in srgb, var(--danger, #d64545) 18%, var(--surface)) !important; opacity: 0.6;`

### 4.4. SQL Preview Generator
Create `src/features/table/previewSql.ts`:
- Converts `BuiltChange[]` (from `this.grid.changes()`) and `this.object` into SQL statements formatted according to the connection dialect:
  - `INSERT INTO <quotedTable> (<cols>) VALUES (<vals>);`
  - `UPDATE <quotedTable> SET <col> = <val>, ... WHERE <keyCols> = <keyVals>;`
  - `DELETE FROM <quotedTable> WHERE <keyCols> = <keyVals>;`
- Uses `quoteTable`, `quoteIdent`, and `valueLiteral` from `src/core/sql.ts`.
- Opens a modal via `openModal` displaying the SQL with syntax styling and a "Copy SQL" button.

### 4.5. Double-Click Inline Editing
`DataGrid` already supports inline editing via `handleDoubleClick` and `beginEdit`. Ensure:
- The cell is made immediately focused and editable on double-click.
- Keyboard shortcuts (Ctrl+S / Cmd+S for Submit, Ctrl+Z / Cmd+Z or Revert button) trigger `submit()` and `discard()`.
