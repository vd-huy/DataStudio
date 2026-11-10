/**
 * Extracts the single target table from a SELECT statement so that its query result can be made editable.
 */
import type { ColumnInfo } from "../../core/contract";

export interface ExtractedTable {
  database: string | null;
  schema: string | null;
  name: string;
}

/**
 * Parses a SQL statement to find if it is a simple SELECT from a single table.
 * Returns the table info if it can be safely edited, or null if it's complex (JOIN, GROUP BY, UNION, CTE, etc.).
 */
export function extractTargetTable(sql: string): ExtractedTable | null {
  if (!sql) return null;

  // Strip multi-line and single-line comments
  const clean = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .trim();

  // Must start with SELECT
  if (!/^select\b/i.test(clean)) return null;

  // Reject queries with JOIN, UNION, GROUP BY, HAVING, subqueries inside FROM, or window functions
  if (/\b(join|union|group\s+by|having)\b/i.test(clean)) return null;

  // Match: FROM <target>
  // Supporting optional quotes: `table`, "table", [table], or bare identifier.
  // Optional schema: schema.table or db.schema.table
  const fromMatch = clean.match(
    /\bfrom\s+((?:(?:`[^`]+`|"[^"]+"|\x5B[^\x5D]+\x5D|[a-zA-Z0-9_$]+)\s*\.\s*)*(?:`[^`]+`|"[^"]+"|\x5B[^\x5D]+\x5D|[a-zA-Z0-9_$]+))/i,
  );
  if (!fromMatch) return null;

  const rawTarget = fromMatch[1].trim();

  // If there's a comma after the from clause before WHERE/ORDER/LIMIT, it's a multi-table FROM (e.g. FROM a, b)
  const afterFrom = clean.slice((fromMatch.index ?? 0) + fromMatch[0].length);
  const nextWord = afterFrom.trim();
  if (nextWord.startsWith(",")) return null;

  // Split schema / table parts
  const rawParts = rawTarget.split(/\s*\.\s*/);
  const parts = rawParts.map((p) => p.replace(/^[`"[\]]|[`"[\]]$/g, ""));

  if (parts.length === 1 && parts[0]) {
    return { database: null, schema: null, name: parts[0] };
  }
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { database: null, schema: parts[0], name: parts[1] };
  }
  if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
    return { database: parts[0], schema: parts[1], name: parts[2] };
  }

  return null;
}

/**
 * Finds key columns from result columns (checking primaryKey hint, identity, or column named "id").
 */
export function findKeyColumns(columns: ColumnInfo[]): string[] {
  const pk = columns.filter((col) => col.hints?.primary || col.identity !== null || col.name.toLowerCase() === "id");
  if (pk.length > 0) return pk.map((c) => c.name);
  return [];
}
