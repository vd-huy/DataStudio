import { describe, expect, it, vi } from "vitest";
import { ResultArea } from "./resultArea";
import { RunResults } from "./runResults";

// Keep the result lifecycle real; replace only browser rendering and grid/pager controls.
vi.mock("../../core/dom", () => ({
  formatNumber: String,
  h: () => ({
    append: vi.fn(),
    replaceChildren: vi.fn(),
    insertBefore: vi.fn(),
    addEventListener: vi.fn(),
    remove: vi.fn(),
    classList: { toggle: vi.fn() },
  }),
}));
vi.mock("../grid/grid", () => ({
  DataGrid: class {
    element = { addEventListener: vi.fn() };
    load = vi.fn();
    dispose = vi.fn();
  },
  gridSetup: (columns: unknown, rows: unknown) => ({ columns, rows }),
}));
vi.mock("../table/pageSizePill", () => ({
  loadDefaultPageSize: (fallback = 200) => fallback,
  createPageSizePill: () => ({ element: {}, update: vi.fn() }),
}));

describe("query result grid lifecycle", () => {
  it("uses the query default and takes the actual page size when the backend caps a completed result", () => {
    const area = new ResultArea(() => "mysql");
    const results = new RunResults();
    const rows = Array.from({ length: 200 }, (_, v) => [{ t: "int" as const, v }]);
    area.start(results);
    results.apply({ event: "statement", index: 0, sql: "SELECT * FROM mdl_onestudy_teachers WHERE status = 3" });
    results.apply({ event: "columns", index: 0, columns: [] });
    results.apply({ event: "rows", index: 0, rows });
    area.update(results, false);

    const panel = area.activePanel();
    expect(panel?.limit).toBe(1000);
    results.apply({ event: "done", index: 0, affected: null, rows: rows.length, truncated: true, elapsedMs: 1 });
    area.update(results, true);

    expect(panel?.pageSpan).toBe(200);
    expect(panel?.pageSizePill?.update).toHaveBeenLastCalledWith(expect.objectContaining({ count: 200, hasMore: true }));
  });

  it("loads columns and the pager for an empty SELECT result", () => {
    const area = new ResultArea(() => "mysql");
    const results = new RunResults();
    const columns = [
      {
        name: "id",
        typeName: "int",
        kind: { kind: "int" as const },
        nullable: false,
        default: null,
        comment: null,
        identity: null,
        generated: null,
        hints: {},
      },
    ];
    area.start(results);
    results.apply({ event: "statement", index: 0, sql: "SELECT * FROM feedback" });
    results.apply({ event: "columns", index: 0, columns });
    results.apply({ event: "done", index: 0, affected: null, rows: 0, truncated: false, elapsedMs: 1 });
    area.update(results, true);

    expect(area.activeGrid()?.load).toHaveBeenCalledWith(expect.objectContaining({ columns, rows: [] }));
    expect(area.activePanel()?.pageSizePill?.update).toHaveBeenCalledWith(expect.objectContaining({ count: 0, total: 0, exactTotal: true }));
  });
});
