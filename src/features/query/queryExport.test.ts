import { describe, expect, it, vi } from "vitest";
import type { ConnectionApi } from "../../core/connectionApi";
import type { RunRequest } from "../../core/contract";
import { fetchAllRows } from "../importExport/exportFetch";
import { queryExportReader } from "./queryExport";
import { run as runMockSql } from "../../dev/mock/engines/mysql";

describe("export all SELECT rows", () => {
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
      const reading = fetchAllRows(queryExportReader({ run }, "export", "SELECT * FROM customers", "shop", "mysql"), context.signal);
      await vi.runAllTimersAsync();
      expect(await reading).toHaveLength(2000);
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
    const read = queryExportReader({ run }, "session", "SELECT id FROM t WHERE active = 1 LIMIT 455", "shop", "mysql");
    const rows = await fetchAllRows(read, new AbortController().signal);
    expect(rows).toHaveLength(455);
    expect(rows[454]).toEqual([{ t: "int", v: 454 }]);
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.database === "shop" && request.text.includes("WHERE active = 1 LIMIT 455"))).toBe(true);
  });

  it("keeps read errors visible instead of silently exporting a partial result", async () => {
    const run: ConnectionApi["run"] = async () => {
      throw new Error("read failed");
    };
    await expect(queryExportReader({ run }, "session", "SELECT * FROM t", "shop", "mysql")({ offset: 0, after: null }, 1000)).rejects.toThrow("read failed");
  });
});
