import { afterEach, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { Channel } from "@tauri-apps/api/core";
import { api } from "./api";
import { RunResults } from "../features/query/runResults";

afterEach(() => vi.unstubAllGlobals());

describe("desktop query streaming", () => {
  it.each([false, true])("waits for delayed rows before finishing the run (out of order: %s)", async (outOfOrder) => {
    vi.stubGlobal("window", { crypto: globalThis.crypto });
    const results = new RunResults();
    let sendRemaining = () => {};
    mockIPC((_command, payload) => {
      const channel = (payload as { onEvent: Channel<unknown> }).onEvent;
      const internals = (window as unknown as { __TAURI_INTERNALS__: { runCallback(id: number, message: unknown): void } }).__TAURI_INTERNALS__;
      const send = (index: number, message: unknown) => internals.runCallback(channel.id, { index, message });
      send(0, { event: "statement", index: 0, sql: "SELECT * FROM feedback" });
      send(1, { event: "columns", index: 0, columns: [] });
      sendRemaining = () => {
        if (outOfOrder) {
          send(4, { __datastudioStreamEnd: true });
          internals.runCallback(channel.id, { index: 5, end: true });
          send(3, { event: "done", index: 0, affected: null, rows: 1, truncated: false, elapsedMs: 1 });
        }
        send(2, { event: "rows", index: 0, rows: [[{ t: "int", v: 1 }]] });
        if (!outOfOrder) {
          send(3, { event: "done", index: 0, affected: null, rows: 1, truncated: false, elapsedMs: 1 });
          send(4, { __datastudioStreamEnd: true });
          internals.runCallback(channel.id, { index: 5, end: true });
        }
      };
      return { statements: 1, elapsedMs: 1, stopped: false, transaction: null };
    });

    let recordedRows: number | null = null;
    const run = api
      .run("session", { text: "SELECT * FROM feedback", database: null, offset: 0 }, (event) => results.apply(event))
      .then(() => {
        recordedRows = results.rowCount();
      });
    // The invoke reply is available, but the row batch is still in flight.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const rowsBeforeDelivery = recordedRows;
    sendRemaining();
    await run;

    expect(rowsBeforeDelivery).toBeNull();
    expect(recordedRows).toBe(1);
    expect(results.history()[0].rows).toBe(1);
  });

  it("propagates a rejected command without waiting for a channel marker", async () => {
    vi.stubGlobal("window", { crypto: globalThis.crypto });
    const error = { code: "CONFIRMATION_REQUIRED", message: "Confirm this run" };
    mockIPC(() => Promise.reject(error));
    await expect(api.run("session", { text: "DELETE FROM feedback", database: null, offset: 0 }, vi.fn())).rejects.toBe(error);
  });

  it("finishes an empty run when its completion marker arrives before the reply", async () => {
    vi.stubGlobal("window", { crypto: globalThis.crypto });
    mockIPC((_command, payload) => {
      const channel = (payload as { onEvent: Channel<unknown> }).onEvent;
      channel.onmessage({ __datastudioStreamEnd: true });
      return { statements: 0, elapsedMs: 1, stopped: false, transaction: null };
    });
    const onEvent = vi.fn();
    await expect(api.run("session", { text: "", database: null, offset: 0 }, onEvent)).resolves.toMatchObject({ statements: 0 });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
