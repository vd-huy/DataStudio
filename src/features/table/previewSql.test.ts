import { describe, expect, it } from "vitest";
import type { RowChange } from "../../core/contract";
import { generatePreviewSql } from "./previewSql";

const int = (v: number) => ({ t: "int" as const, v });
const text = (v: string) => ({ t: "text" as const, v });
const nul = () => ({ t: "null" as const, v: null });

describe("generatePreviewSql", () => {
  it("generates INSERT statement", () => {
    const changes: RowChange[] = [
      {
        op: "insert",
        values: [
          { column: "id", value: int(1) },
          { column: "name", value: text("Lớp 1") },
        ],
      },
    ];
    const sql = generatePreviewSql("classrooms", changes, "mysql");
    expect(sql).toBe("INSERT INTO `classrooms` (`id`, `name`)\nVALUES (1, 'Lớp 1');");
  });

  it("generates UPDATE statement with primary key", () => {
    const changes: RowChange[] = [
      {
        op: "update",
        key: [{ column: "id", value: int(3) }],
        values: [{ column: "name", value: text("Toán học 7") }],
        original: [
          { column: "id", value: int(3) },
          { column: "name", value: text("Toán học 6") },
        ],
      },
    ];
    const sql = generatePreviewSql("classrooms", changes, "mysql");
    expect(sql).toBe("UPDATE `classrooms`\nSET `name` = 'Toán học 7'\nWHERE `id` = 3;");
  });

  it("generates UPDATE with null where condition and multiple columns", () => {
    const changes: RowChange[] = [
      {
        op: "update",
        key: [{ column: "code", value: nul() }],
        values: [{ column: "status", value: int(1) }],
        original: [],
      },
    ];
    const sql = generatePreviewSql("schema.table", changes, "ansi");
    expect(sql).toBe('UPDATE "schema"."table"\nSET "status" = 1\nWHERE "code" IS NULL;');
  });

  it("generates DELETE statement", () => {
    const changes: RowChange[] = [
      {
        op: "delete",
        key: [{ column: "id", value: int(10) }],
        original: [],
      },
    ];
    const sql = generatePreviewSql("users", changes, "tsql");
    expect(sql).toBe("DELETE FROM [users]\nWHERE [id] = 10;");
  });

  it("generates batch of mixed changes with comments and separation", () => {
    const changes: RowChange[] = [
      {
        op: "insert",
        values: [{ column: "id", value: int(1) }],
      },
      {
        op: "delete",
        key: [{ column: "id", value: int(2) }],
        original: [],
      },
    ];
    const sql = generatePreviewSql("items", changes, "mysql");
    expect(sql).toContain("INSERT INTO `items` (`id`)\nVALUES (1);");
    expect(sql).toContain("DELETE FROM `items`\nWHERE `id` = 2;");
  });

  it("returns notice when changes array is empty", () => {
    const sql = generatePreviewSql("items", [], "mysql");
    expect(sql).toBe("-- No pending changes");
  });
});
