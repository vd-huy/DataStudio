/**
 * Builds server-side paginated, sorted, and counted SQL queries from user SELECT statements.
 */
import { quoteIdent, type SqlDialect } from "../../core/sql";
import type { SortState } from "../grid/grid";

/**
 * Checks whether a SQL query is a SELECT statement (or CTE with WITH) that can be wrapped in a subquery
 * for server-side sorting and pagination.
 */
export function isPaginatableQuery(sql: string): boolean {
  if (!sql) return false;
  // Remove multi-line and single-line comments
  const clean = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim();

  // Must begin with SELECT or WITH
  if (!/^(select|with)\b/i.test(clean)) return false;

  // If there's a semicolon followed by non-whitespace, it's multi-statement (do not wrap)
  const statements = clean
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (statements.length > 1) return false;

  return true;
}

/**
 * Cleans the SQL statement by removing trailing semicolons and whitespace.
 */
export function cleanQuerySql(sql: string): string {
  return sql
    .trim()
    .replace(/;+\s*$/, "")
    .trim();
}

/**
 * Wraps `baseSql` in a subquery and adds ORDER BY and LIMIT/OFFSET clauses for the given dialect.
 * This guarantees that rows are sorted on the server before pagination is applied.
 */
export function buildPaginatedQuery(baseSql: string, dialect: SqlDialect, limit: number, offset: number, sort: SortState | null): string {
  const clean = cleanQuerySql(baseSql);
  const orderClause = sort ? ` ORDER BY ${quoteIdent(sort.column, dialect)} ${sort.descending ? "DESC" : "ASC"}` : "";

  if (dialect === "tsql") {
    // T-SQL requires an ORDER BY clause for OFFSET ... FETCH
    const order = orderClause || " ORDER BY (SELECT NULL)";
    return `SELECT * FROM (\n${clean}\n) AS _datastudio_page${order} OFFSET ${Math.max(0, offset)} ROWS FETCH NEXT ${Math.max(1, limit)} ROWS ONLY;`;
  }

  const offsetClause = offset > 0 ? ` OFFSET ${offset}` : "";
  return `SELECT * FROM (\n${clean}\n) AS _datastudio_page${orderClause} LIMIT ${Math.max(1, limit)}${offsetClause};`;
}

/**
 * Wraps `baseSql` in a COUNT(*) query to get the total number of matching rows.
 */
export function buildCountQuery(baseSql: string): string {
  const clean = cleanQuerySql(baseSql);
  return `SELECT COUNT(*) AS total FROM (\n${clean}\n) AS _subquery_count;`;
}
