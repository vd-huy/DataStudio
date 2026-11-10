import { describe, expect, it } from "vitest";
import { extractTargetTable, findKeyColumns } from "./tableExtractor";
import type { ColumnInfo } from "../../core/contract";

describe("extractTargetTable", () => {
  it("extracts simple table name from SELECT * FROM table", () => {
    expect(extractTargetTable("select * from mdl_onestudy_classrooms")).toEqual({
      database: null,
      schema: null,
      name: "mdl_onestudy_classrooms",
    });
  });

  it("handles trailing semicolon and whitespace", () => {
    expect(extractTargetTable("  SELECT * FROM mdl_onestudy_teachers;  ")).toEqual({
      database: null,
      schema: null,
      name: "mdl_onestudy_teachers",
    });
  });

  it("handles WHERE, ORDER BY, LIMIT clauses", () => {
    expect(extractTargetTable("select id, name from users where status = 1 order by id desc limit 100;")).toEqual({
      database: null,
      schema: null,
      name: "users",
    });
  });

  it("extracts schema and table from schema.table", () => {
    expect(extractTargetTable("SELECT * FROM public.users")).toEqual({
      database: null,
      schema: "public",
      name: "users",
    });
  });

  it("handles backticks, double quotes, and brackets", () => {
    expect(extractTargetTable("select * from `my_db`.`my_table`")).toEqual({
      database: null,
      schema: "my_db",
      name: "my_table",
    });
    expect(extractTargetTable('select * from "schema"."users"')).toEqual({
      database: null,
      schema: "schema",
      name: "users",
    });
    expect(extractTargetTable("select * from [dbo].[customers]")).toEqual({
      database: null,
      schema: "dbo",
      name: "customers",
    });
  });

  it("handles database.schema.table", () => {
    expect(extractTargetTable("SELECT * FROM db.schema.table")).toEqual({
      database: "db",
      schema: "schema",
      name: "table",
    });
  });

  it("ignores comments", () => {
    expect(
      extractTargetTable(`
      -- A comment
      /* Multi-line
         comment */
      SELECT * FROM products;
    `),
    ).toEqual({
      database: null,
      schema: null,
      name: "products",
    });
  });

  it("returns null for JOIN queries", () => {
    expect(extractTargetTable("SELECT * FROM a JOIN b ON a.id = b.id")).toBeNull();
    expect(extractTargetTable("SELECT * FROM a LEFT JOIN b ON a.id = b.id")).toBeNull();
  });

  it("returns null for multi-table comma JOIN", () => {
    expect(extractTargetTable("SELECT * FROM a, b WHERE a.id = b.id")).toBeNull();
  });

  it("returns null for GROUP BY, HAVING, or UNION", () => {
    expect(extractTargetTable("SELECT category, count(*) FROM items GROUP BY category")).toBeNull();
    expect(extractTargetTable("SELECT * FROM a UNION SELECT * FROM b")).toBeNull();
  });

  it("returns null for non-SELECT statements", () => {
    expect(extractTargetTable("UPDATE users SET name = 'abc'")).toBeNull();
    expect(extractTargetTable("INSERT INTO users VALUES (1)")).toBeNull();
    expect(extractTargetTable("DELETE FROM users WHERE id = 1")).toBeNull();
  });
});

describe("findKeyColumns", () => {
  const col = (name: string, hints: Record<string, unknown> = {}, identity: string | null = null): ColumnInfo => ({
    name,
    typeName: "int",
    kind: { kind: "int" },
    nullable: false,
    default: null,
    comment: null,
    identity,
    generated: null,
    hints,
  });

  it("finds primary hint", () => {
    expect(findKeyColumns([col("uuid", { primary: true }), col("name")])).toEqual(["uuid"]);
  });

  it("finds identity column", () => {
    expect(findKeyColumns([col("num", {}, "auto_increment"), col("data")])).toEqual(["num"]);
  });

  it("finds id column", () => {
    expect(findKeyColumns([col("ID"), col("name")])).toEqual(["ID"]);
  });

  it("returns empty array if no PK found", () => {
    expect(findKeyColumns([col("first_name"), col("last_name")])).toEqual([]);
  });
});
