import type { ConnectionApi } from "../../core/connectionApi";
import type { Value } from "../../core/contract";
import type { SqlDialect } from "../../core/sql";
import type { SortState } from "../grid/grid";
import { ExportCancelled, type PageCursor } from "../importExport/exportFetch";
import { buildPaginatedQuery } from "./queryPaging";

/** Read a page of the original SELECT for a full export or result grid. */
export function queryExportReader(
  connection: Pick<ConnectionApi, "run">,
  sessionId: string,
  sql: string,
  database: string | null,
  dialect: SqlDialect,
  sort: SortState | null = null,
  tieBreakers: readonly string[] = [],
) {
  return async (cursor: PageCursor, limit: number) => {
    const rows: Value[][] = [];
    let truncated = false;
    let elapsedMs = 0;
    const summary = await connection.run(
      sessionId,
      { text: buildPaginatedQuery(sql, dialect, limit + 1, cursor.offset, sort, tieBreakers), database, offset: 0 },
      (event) => {
        if (event.event === "rows") rows.push(...event.rows);
        if (event.event === "done") {
          truncated = event.truncated;
          elapsedMs = event.elapsedMs;
        }
      },
      null,
      limit + 1,
    );
    if (summary?.stopped) throw new ExportCancelled();
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit || truncated, nextKeyset: null, elapsedMs: summary?.elapsedMs ?? elapsedMs };
  };
}
