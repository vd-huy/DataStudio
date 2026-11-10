import type { Field, RowChange } from "../../core/contract";
import { openModal, toast } from "../../core/dialogs";
import { copyText, h } from "../../core/dom";
import { quoteIdent, quoteTable, valueLiteral, type SqlDialect } from "../../core/sql";

function whereClause(fields: Field[], dialect: SqlDialect): string {
  if (fields.length === 0) return "";
  return fields
    .map((field) => {
      const quotedCol = quoteIdent(field.column, dialect);
      if (field.value.t === "null") return `${quotedCol} IS NULL`;
      return `${quotedCol} = ${valueLiteral(field.value, dialect)}`;
    })
    .join(" AND ");
}

export function generatePreviewSql(tableName: string, changes: RowChange[], dialect: SqlDialect): string {
  if (changes.length === 0) return "-- No pending changes";

  const table = quoteTable(tableName, dialect);
  const statements: string[] = [];

  for (const change of changes) {
    if (change.op === "insert") {
      const cols = change.values.map((f) => quoteIdent(f.column, dialect)).join(", ");
      const vals = change.values.map((f) => valueLiteral(f.value, dialect)).join(", ");
      statements.push(`INSERT INTO ${table} (${cols})\nVALUES (${vals});`);
    } else if (change.op === "update") {
      const setClauses = change.values.map((f) => `${quoteIdent(f.column, dialect)} = ${valueLiteral(f.value, dialect)}`).join(", ");
      const whereFields = change.key.length > 0 ? change.key : change.original;
      const where = whereClause(whereFields, dialect);
      statements.push(`UPDATE ${table}\nSET ${setClauses}${where ? `\nWHERE ${where}` : ""};`);
    } else if (change.op === "delete") {
      const whereFields = change.key.length > 0 ? change.key : change.original;
      const where = whereClause(whereFields, dialect);
      statements.push(`DELETE FROM ${table}${where ? `\nWHERE ${where}` : ""};`);
    }
  }

  return statements.join("\n\n");
}

export function openPreviewSqlDialog(tableName: string, changes: RowChange[], dialect: SqlDialect): void {
  const sql = generatePreviewSql(tableName, changes, dialect);
  const code = h("code", { class: "preview-sql-code" }, sql);
  const pre = h("pre", { class: "preview-sql-pre" }, code);
  const body = h("div", { class: "preview-sql-body" }, pre);

  openModal(
    `Preview SQL (${changes.length} change${changes.length === 1 ? "" : "s"})`,
    body,
    [
      {
        label: "Copy SQL",
        run: () => {
          void copyText(sql).then(() => toast("SQL copied to clipboard", "success"));
        },
      },
      { label: "Close", primary: true, run: () => undefined },
    ],
    { width: 680 },
  );
}
