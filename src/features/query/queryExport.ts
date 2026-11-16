import type { ConnectionApi } from "../../core/connectionApi";
import type { Value } from "../../core/contract";
import type { SqlDialect } from "../../core/sql";
import type { PageReader } from "../importExport/exportFetch";
import { buildPaginatedQuery } from "./queryPaging";

/** Read the original SELECT, independently of the page displayed in the result grid. */
export function queryExportReader(
  connection: Pick<ConnectionApi, "run">,
  sessionId: string,
  sql: string,
  database: string | null,
  dialect: SqlDialect,
): PageReader {
  return async (cursor, limit) => {
    const rows: Value[][] = [];
    let truncated = false;
    await connection.run(
      sessionId,
      { text: buildPaginatedQuery(sql, dialect, limit + 1, cursor.offset, null), database, offset: 0 },
      (event) => {
        if (event.event === "rows") rows.push(...event.rows);
        if (event.event === "done") truncated = event.truncated;
      },
      null,
      limit + 1,
    );
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit || truncated, nextKeyset: null };
  };
}
