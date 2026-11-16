import { CompletionContext, type CompletionResult, type CompletionSource } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import { defaultLanguageSupport, formatJsonLike, jsonLanguageSupport, splitStatements, sqlLanguageSupport, statementAt } from "./language";
import type { ConnectionApi } from "./connectionApi";
import type { LanguageSpec, ObjectDescription, ObjectRef } from "./contract";
import { EMPTY_SCHEMA, type CompletionSchema } from "../lang/types";

describe("SQL completion metadata", () => {
  const language: LanguageSpec = { id: "sql", label: "SQL", editor: "sql", dialect: "mySql", default: true, hint: "", fences: [] };
  const query =
    "select concat(u.f|, u.lastname) as 'Họ tên', t.staff_id from mdl_onestudy_teachers t\njoin mdl_user u on u.id = t.user_id\nwhere t.staff_id in ('A115999', 'A116510')";
  const description = (object: ObjectRef, names = ["id", "firstname", "lastname"]): ObjectDescription => ({
    object,
    comment: null,
    columns: names.map((name) => ({
      name,
      typeName: "varchar(100)",
      kind: { kind: "text" },
      nullable: false,
      default: null,
      comment: null,
      identity: null,
      generated: null,
      hints: {},
    })),
    primaryKey: { name: "PRIMARY", columns: ["id"] },
    uniqueKeys: [],
    foreignKeys: [],
    referencedBy: [],
    indexes: [],
    rowEstimate: null,
    ddl: null,
    extra: [],
  });
  const context = async (support: ReturnType<typeof sqlLanguageSupport>, connection: ConnectionApi, database = "school", reload = false, text = query) => {
    const pos = text.indexOf("|");
    const extensions = await support.editorExtensions({ language, connection, database, reload });
    const state = EditorState.create({ doc: text.replace("|", ""), selection: { anchor: pos }, extensions });
    const source = state.languageDataAt<CompletionSource>("autocomplete", pos)[0];
    return { source, request: new CompletionContext(state, pos, false) };
  };
  const labels = (result: CompletionResult | null) => result?.options.map((option) => option.label) ?? [];

  it("loads only the alias's table while the full schema is still pending", async () => {
    let finishSchema!: (schema: CompletionSchema) => void;
    const completionSchema = vi.fn(
      () =>
        new Promise<CompletionSchema>((resolve) => {
          finishSchema = resolve;
        }),
    );
    const describeTable = vi.fn(async (object: ObjectRef) => description(object));
    const connection = { connectionId: "school-db", completionSchema, describe: describeTable } as unknown as ConnectionApi;
    const { source, request } = await context(sqlLanguageSupport("mySql"), connection);
    const results = await Promise.all([source(request), source(request)]);
    expect(labels(results[0])).toContain("firstname");
    expect(labels(results[1])).toContain("lastname");
    expect(describeTable).toHaveBeenCalledExactlyOnceWith({ database: "school", schema: null, name: "mdl_user", kind: "table" });
    // The later bulk response must not discard columns loaded for this query.
    finishSchema({ ...EMPTY_SCHEMA, tables: [{ name: "mdl_user", kind: "table", columns: [] }] });
    await vi.waitFor(() => expect(completionSchema).toHaveResolved());
    expect(labels(await source(request))).toContain("firstname");
    expect(describeTable).toHaveBeenCalledTimes(1);
  });

  it("keeps columns when bulk metadata and a table description finish together", async () => {
    let finishSchema!: (schema: CompletionSchema) => void;
    let finishTable!: (description: ObjectDescription) => void;
    const completionSchema = vi.fn(
      () =>
        new Promise<CompletionSchema>((resolve) => {
          finishSchema = resolve;
        }),
    );
    const describeTable = vi.fn(
      () =>
        new Promise<ObjectDescription>((resolve) => {
          finishTable = resolve;
        }),
    );
    const connection = { connectionId: "race-db", completionSchema, describe: describeTable } as unknown as ConnectionApi;
    const { source, request } = await context(sqlLanguageSupport("mySql"), connection);
    const result = source(request);
    finishSchema({ ...EMPTY_SCHEMA, tables: [{ name: "mdl_user", kind: "table", columns: [] }] });
    finishTable(description({ database: "school", schema: null, name: "mdl_user", kind: "table" }));
    expect(labels(await result)).toContain("firstname");
    expect(labels(await source(request))).toContain("firstname");
    expect(describeTable).toHaveBeenCalledTimes(1);
  });

  it("awaits the catalog for names after early columns have populated the cache", async () => {
    let finish!: (schema: CompletionSchema) => void;
    const completionSchema = vi.fn(
      () =>
        new Promise<CompletionSchema>((resolve) => {
          finish = resolve;
        }),
    );
    const describeTable = vi.fn(async (object: ObjectRef) => description(object));
    const connection = { connectionId: "partial-db", completionSchema, describe: describeTable } as unknown as ConnectionApi;
    const support = sqlLanguageSupport("mySql");
    const member = await context(support, connection);
    expect(labels(await member.source(member.request))).toContain("firstname");
    const names = await context(support, connection, "school", false, "select * from ord|");
    const qualified = await context(support, connection, "school", false, "select * from mdl_user u join sales.|");
    const namesResult = names.source(names.request);
    const qualifiedResult = qualified.source(qualified.request);
    finish({ ...EMPTY_SCHEMA, schemas: ["sales"], tables: [{ name: "orders", schema: "sales", kind: "table", columns: [] }] });
    expect(labels(await namesResult)).toContain("sales.orders");
    expect(labels(await qualifiedResult)).toContain("orders");
    expect(describeTable).toHaveBeenCalledTimes(1);
  });

  it("completes a table beyond the diagram cap without describing unrelated tables", async () => {
    const tables = Array.from({ length: 578 }, (_, i) => ({ name: `mdl_${String(i).padStart(4, "0")}`, kind: "table", columns: [] }));
    tables.push({ name: "mdl_user", kind: "table", columns: [] });
    const completionSchema = vi.fn(async () => ({ ...EMPTY_SCHEMA, tables }));
    const describeTable = vi.fn(async (object: ObjectRef) => description(object));
    const connection = { connectionId: "large-db", completionSchema, describe: describeTable } as unknown as ConnectionApi;
    const { source, request } = await context(sqlLanguageSupport("mySql"), connection);
    expect(labels(await source(request))).toContain("firstname");
    expect(describeTable).toHaveBeenCalledTimes(1);
    expect(describeTable.mock.calls[0][0].name).toBe("mdl_user");
  });

  it("isolates pending columns across database switches and refreshes", async () => {
    let finishOld!: (description: ObjectDescription) => void;
    const completionSchema = vi.fn(async () => EMPTY_SCHEMA);
    const describeTable = vi.fn((object: ObjectRef) =>
      object.database === "old"
        ? new Promise<ObjectDescription>((resolve) => {
            finishOld = resolve;
          })
        : Promise.resolve(description(object, [describeTable.mock.calls.length === 2 ? "fresh_column" : "renamed_column"])),
    );
    const connection = { connectionId: "switch-db", completionSchema, describe: describeTable } as unknown as ConnectionApi;
    const support = sqlLanguageSupport("mySql");
    const old = await context(support, connection, "old");
    const oldResult = old.source(old.request);
    const current = await context(support, connection, "current");
    expect(labels(await current.source(current.request))).toEqual(["fresh_column"]);
    finishOld(description({ database: "old", schema: null, name: "mdl_user", kind: "table" }, ["stale_column"]));
    await oldResult;
    expect(labels(await current.source(current.request))).toEqual(["fresh_column"]);
    const refreshed = await context(support, connection, "current", true);
    expect(labels(await refreshed.source(refreshed.request))).toEqual(["renamed_column"]);
    expect(describeTable).toHaveBeenCalledTimes(3);
  });

  it("retries a failed table read even when the bulk catalog failed", async () => {
    const completionSchema = vi.fn(async () => {
      throw new Error("Catalog unavailable");
    });
    const describeTable = vi
      .fn<(object: ObjectRef) => Promise<ObjectDescription>>()
      .mockRejectedValueOnce(new Error("Connection busy"))
      .mockImplementation(async (object) => description(object));
    const connection = { connectionId: "retry-db", completionSchema, describe: describeTable } as unknown as ConnectionApi;
    const { source, request } = await context(sqlLanguageSupport("mySql"), connection);
    expect(await source(request)).toBeNull();
    expect(labels(await source(request))).toContain("firstname");
    expect(labels(await source(request))).toContain("firstname");
    expect(describeTable).toHaveBeenCalledTimes(2);
  });

  it("describes a schema-qualified view using its catalog identity", async () => {
    const completionSchema = vi.fn(async () => ({
      ...EMPTY_SCHEMA,
      schemas: ["sales"],
      tables: [{ schema: "sales", name: "mdl_user", kind: "view", columns: [] }],
    }));
    const describeTable = vi.fn(async (object: ObjectRef) => description(object));
    const connection = { connectionId: "view-db", completionSchema, describe: describeTable } as unknown as ConnectionApi;
    const { source, request } = await context(sqlLanguageSupport("postgres"), connection, "school", false, "select u.f| from sales.mdl_user u");
    const result = await source(request);
    expect(labels(result)).toContain("firstname");
    expect(result?.options.find((column) => column.label === "id")?.detail).toContain("PK");
    expect(describeTable).toHaveBeenCalledExactlyOnceWith({ database: "school", schema: "sales", name: "mdl_user", kind: "view" });
  });

  it("loads source columns for CTEs and subqueries without describing their aliases", async () => {
    for (const text of [
      "with people as (select * from mdl_user) select u.f| from people u",
      "select u.f| from (select * from mdl_user) u",
      "with people as (select id, u.* from mdl_user u) select p.f| from people p",
    ]) {
      const describeTable = vi.fn(async (object: ObjectRef) => description(object));
      const connection = { connectionId: "derived-db", completionSchema: async () => EMPTY_SCHEMA, describe: describeTable } as unknown as ConnectionApi;
      const { source, request } = await context(sqlLanguageSupport("mySql"), connection, "school", false, text);
      expect(labels(await source(request)), text).toContain("firstname");
      expect(describeTable).toHaveBeenCalledExactlyOnceWith({ database: "school", schema: null, name: "mdl_user", kind: "table" });
    }
  });

  it("awaits table names while keeping keywords available and strings quiet", async () => {
    let finish!: (schema: CompletionSchema) => void;
    const completionSchema = vi.fn(
      () =>
        new Promise<CompletionSchema>((resolve) => {
          finish = resolve;
        }),
    );
    const describeTable = vi.fn(async (object: ObjectRef) => description(object));
    const connection = { connectionId: "names-db", completionSchema, describe: describeTable } as unknown as ConnectionApi;
    const support = sqlLanguageSupport("mySql");
    const keyword = await context(support, connection, "school", false, "sel|");
    expect(labels(await keyword.source(keyword.request))).toContain("select");
    const string = await context(support, connection, "school", false, "select 'u.f|' from mdl_user u");
    expect(await string.source(string.request)).toBeNull();
    const names = await context(support, connection, "school", false, "select * from mdl_|");
    const result = names.source(names.request);
    finish({ ...EMPTY_SCHEMA, tables: [{ name: "mdl_user", kind: "table", columns: [] }] });
    expect(labels(await result)).toContain("mdl_user");
    expect(describeTable).not.toHaveBeenCalled();
    expect(completionSchema).toHaveBeenCalledTimes(1);
  });
});

const texts = (text: string, ranges: { from: number; to: number }[]) => ranges.map((range) => text.slice(range.from, range.to));

describe("splitStatements", () => {
  it("splits on semicolons and trims", () => {
    const text = "SELECT 1;\n  SELECT 2 ;\nSELECT 3";
    expect(texts(text, splitStatements(text))).toEqual(["SELECT 1", "SELECT 2", "SELECT 3"]);
  });

  it("ignores semicolons in strings, identifiers and comments", () => {
    const text = "SELECT ';', \"a;b\", `c;d` FROM t -- x; y\nWHERE a = 'it''s;'; /* one; two */ SELECT 2";
    expect(texts(text, splitStatements(text))).toEqual(["SELECT ';', \"a;b\", `c;d` FROM t -- x; y\nWHERE a = 'it''s;'", "/* one; two */ SELECT 2"]);
  });

  it("skips parts with only comments or whitespace", () => {
    const text = "SELECT 1;;  -- trailing note\n";
    expect(texts(text, splitStatements(text))).toEqual(["SELECT 1"]);
  });

  it("knows backslash escapes, hash comments and brackets when asked", () => {
    expect(texts("SELECT 'a\\';b'; SELECT 2", splitStatements("SELECT 'a\\';b'; SELECT 2"))).toEqual(["SELECT 'a\\';b'", "SELECT 2"]);
    const hash = "SELECT 1 # note; more\n; SELECT 2";
    expect(texts(hash, splitStatements(hash, { hashComments: true }))).toEqual(["SELECT 1 # note; more", "SELECT 2"]);
    const brackets = "SELECT [a;b] FROM t; SELECT 2";
    expect(texts(brackets, splitStatements(brackets, { bracketIdentifiers: true }))).toEqual(["SELECT [a;b] FROM t", "SELECT 2"]);
  });
});

describe("statementAt", () => {
  const text = "SELECT 1;\n\nSELECT 2;\nSELECT 3";
  const at = (offset: number) => {
    const range = statementAt(text, offset);
    return text.slice(range.from, range.to);
  };

  it("finds the statement under the cursor", () => {
    expect(at(0)).toBe("SELECT 1");
    expect(at(14)).toBe("SELECT 2");
    expect(at(text.length)).toBe("SELECT 3");
  });

  it("takes the statement before the cursor between statements", () => {
    expect(at(9)).toBe("SELECT 1");
    expect(at(10)).toBe("SELECT 1");
  });

  it("gives an empty range for empty text", () => {
    expect(statementAt("  ", 1)).toEqual({ from: 1, to: 1 });
  });

  it("is what the default language support uses", async () => {
    const support = defaultLanguageSupport();
    expect(support.statementAt("a; b", 3)).toEqual({ from: 3, to: 4 });
    expect(await support.editorExtensions({ language: { id: "x", label: "X", editor: "text", dialect: null, default: true, hint: "", fences: [] } })).toEqual(
      [],
    );
  });
});

describe("JSON command formatting", () => {
  it("re-indents without touching tokens", () => {
    expect(formatJsonLike('{"find":"products","filter":{"stock":0,"name":"a, b: {c}"},"limit":50}')).toBe(
      '{\n  "find": "products",\n  "filter": {\n    "stock": 0,\n    "name": "a, b: {c}"\n  },\n  "limit": 50\n}',
    );
  });

  it("keeps relaxed JSON, big numbers, empty containers and escaped quotes", () => {
    expect(formatJsonLike('{ find: "x", filter: { _id: ObjectId("65f0") }, n: 12345678901234567890, a: [], s: "q\\"x" }')).toBe(
      '{\n  find: "x",\n  filter: {\n    _id: ObjectId("65f0")\n  },\n  n: 12345678901234567890,\n  a: [],\n  s: "q\\"x"\n}',
    );
  });

  it("leaves text with comments alone", () => {
    const text = '{ "find": "x" } // all';
    expect(formatJsonLike(text)).toBe(text);
  });

  it("treats a JSON command as one statement", () => {
    const support = jsonLanguageSupport("mongo-command");
    expect(support.statementAt('  { "ping": 1 }\n', 3)).toEqual({ from: 2, to: 15 });
  });
});
