// SQL completion loads missing columns only for the tables the current query needs.
import type { ConnectionApi } from "../../core/connectionApi";
import type { ObjectDescription } from "../../core/contract";
import { SchemaCache } from "../schemaCache";
import type { CompletionSchema, CompletionTable } from "../types";
import { findTable, type ScopeTable } from "./analyze";

const tableKey = (table: { name: string; schema?: string }) => JSON.stringify([table.schema ?? "", table.name]);

function describedTable(description: ObjectDescription): CompletionTable {
  return {
    name: description.object.name,
    schema: description.object.schema ?? undefined,
    kind: description.object.kind,
    columns: description.columns.map((column) => {
      const foreign = description.foreignKeys.find((key) => key.columns.includes(column.name));
      const refColumn = foreign?.refColumns[foreign.columns.indexOf(column.name)];
      return {
        name: column.name,
        type: column.typeName,
        pk: !!column.hints.primary || !!description.primaryKey?.columns.includes(column.name),
        ...(foreign && refColumn ? { fk: { table: foreign.refTable, column: refColumn, schema: foreign.refSchema ?? undefined } } : {}),
      };
    }),
  };
}

/** One database and refresh generation. Old requests keep their own cache when the editor switches context. */
export class SqlMetadata {
  readonly schema = new SchemaCache();
  readonly ready: Promise<CompletionSchema>;
  private readonly loaded = new Map<string, CompletionTable>();
  private readonly loading = new Map<string, Promise<void>>();

  constructor(
    readonly connection: ConnectionApi,
    readonly database: string,
  ) {
    this.ready = connection
      .completionSchema(database)
      .then((snapshot) => {
        this.schema.set(this.merge(snapshot));
        return this.schema.get();
      })
      .catch(() => this.schema.get());
  }

  private merge(snapshot: CompletionSchema): CompletionSchema {
    const tables = new Map(snapshot.tables.map((table) => [tableKey(table), table]));
    for (const [key, table] of this.loaded) tables.set(key, table);
    const schemas = new Set(snapshot.schemas);
    for (const table of tables.values()) if (table.schema) schemas.add(table.schema);
    return { ...snapshot, schemas: [...schemas], tables: [...tables.values()] };
  }

  async loadTables(refs: ScopeTable[]): Promise<void> {
    await Promise.all(refs.map((ref) => this.loadTable(ref)));
  }

  private async loadTable(ref: ScopeTable): Promise<void> {
    const snapshot = this.schema.get();
    const table = findTable(snapshot, ref.name, ref.schema);
    if (table?.columns.length) return;
    const object = {
      database: this.database,
      schema: table?.schema ?? ref.schema ?? snapshot.defaultSchema ?? null,
      name: table?.name ?? ref.name,
      kind: table?.kind ?? "table",
    };
    const key = tableKey({ name: object.name, schema: object.schema ?? undefined });
    if (this.loaded.has(key)) return;
    const pending = this.loading.get(key);
    if (pending) return pending;
    const loading = this.connection
      .describe(object)
      .then((description) => {
        const table = describedTable(description);
        this.loaded.set(tableKey(table), table);
        this.schema.set(this.merge(this.schema.get()));
      })
      // A failed description leaves other suggestions usable and can be retried on the next request.
      .catch(() => {})
      .finally(() => this.loading.delete(key));
    this.loading.set(key, loading);
    return loading;
  }
}
