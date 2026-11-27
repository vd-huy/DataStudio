import { describe, expect, it, vi } from "vitest";
import type { ConnectionApi } from "../../core/connectionApi";
import type { RunRequest } from "../../core/contract";
import { ExportCancelled, fetchAllRows } from "../importExport/exportFetch";
import { queryExportReader } from "./queryExport";
import { run as runMockSql } from "../../dev/mock/engines/mysql";

describe("reading all SELECT rows for export or the result grid", () => {
  it("exports every row through the preview SQL engine, beyond the result grid page", async () => {
    vi.useFakeTimers();
    try {
      const transaction = { supported: true, open: false, autoCommit: true, failed: false };
      const context = {
        session: { sessionId: "export", connectionId: "mock", language: "sql", database: "shop", transaction, running: null },
        signal: new AbortController().signal,
      };
      const run: ConnectionApi["run"] = async (_session, request, onEvent) => ({
        statements: await runMockSql!(request, onEvent, context),
        elapsedMs: 1,
        stopped: false,
        transaction,
      });
      const read = queryExportReader({ run }, "export", "SELECT * FROM customers", "shop", "mysql", { column: "id", descending: true });
      const reading = fetchAllRows(read, context.signal);
      await vi.runAllTimersAsync();
      const rows = await reading;
      expect(rows).toHaveLength(2000);
      expect(rows[0][0]).toEqual({ t: "int", v: 2000 });
      expect(rows[1999][0]).toEqual({ t: "int", v: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads beyond the displayed page, including backend row caps without losing rows", async () => {
    const requests: RunRequest[] = [];
    const run: ConnectionApi["run"] = vi.fn(async (_session, request, onEvent) => {
      requests.push(request);
      const offset = Number(request.text.match(/OFFSET (\d+)/)?.[1] ?? 0);
      const count = Math.min(200, 455 - offset);
      onEvent({ event: "rows", index: 0, rows: Array.from({ length: count }, (_, i) => [{ t: "int", v: offset + i }]) });
      onEvent({ event: "done", index: 0, affected: null, rows: count, truncated: offset + count < 455, elapsedMs: 1 });
      return { statements: 1, elapsedMs: 1, stopped: false, transaction: { supported: true, open: false, autoCommit: true, failed: false } };
    });
    const sql = "SELECT id, status FROM mdl_onestudy_teachers WHERE status = 3";
    const read = queryExportReader({ run }, "session", sql, "shop", "mysql", { column: "status", descending: true }, ["id"]);
    const rows = await fetchAllRows(read, new AbortController().signal);
    expect(rows).toEqual(Array.from({ length: 455 }, (_, v) => [{ t: "int", v }]));
    expect(requests.map(({ text }) => Number(text.match(/OFFSET (\d+)/)?.[1] ?? 0))).toEqual([0, 200, 400]);
    expect(requests.every(({ database, text }) => database === "shop" && text.includes(sql) && text.includes("ORDER BY `status` DESC, `id` ASC"))).toBe(true);
  });

  it("treats a stopped page as cancelled instead of accepting a partial result", async () => {
    const run: ConnectionApi["run"] = async () => ({
      statements: 1,
      elapsedMs: 1,
      stopped: true,
      transaction: { supported: true, open: false, autoCommit: true, failed: false },
    });
    const read = queryExportReader({ run }, "session", "SELECT * FROM t", "shop", "mysql");
    await expect(fetchAllRows(read, new AbortController().signal)).rejects.toBeInstanceOf(ExportCancelled);
  });

  it("keeps read errors visible instead of silently exporting a partial result", async () => {
    const run: ConnectionApi["run"] = async () => {
      throw new Error("read failed");
    };
    await expect(queryExportReader({ run }, "session", "SELECT * FROM t", "shop", "mysql")({ offset: 0, after: null }, 1000)).rejects.toThrow("read failed");
  });
});
