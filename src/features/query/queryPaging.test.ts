import { describe, expect, it } from "vitest";
import { buildCountQuery, buildPaginatedQuery, cleanQuerySql, isPaginatableQuery } from "./queryPaging";

describe("queryPaging", () => {
  describe("isPaginatableQuery", () => {
    it("identifies single SELECT queries", () => {
      expect(isPaginatableQuery("SELECT * FROM users")).toBe(true);
      expect(isPaginatableQuery("  select id, name from users where id > 10; ")).toBe(true);
      expect(isPaginatableQuery("/* comment */ SELECT * FROM orders;")).toBe(true);
      expect(isPaginatableQuery("-- line comment\nSELECT * FROM orders")).toBe(true);
      expect(isPaginatableQuery("WITH cte AS (SELECT 1 AS n) SELECT * FROM cte")).toBe(true);
    });

    it("rejects non-SELECT or multi-statement queries", () => {
      expect(isPaginatableQuery("UPDATE users SET name = 'x'")).toBe(false);
      expect(isPaginatableQuery("DELETE FROM users")).toBe(false);
      expect(isPaginatableQuery("INSERT INTO users VALUES (1)")).toBe(false);
      expect(isPaginatableQuery("SHOW TABLES")).toBe(false);
      expect(isPaginatableQuery("SELECT 1; SELECT 2;")).toBe(false);
      expect(isPaginatableQuery("")).toBe(false);
    });
  });

  describe("cleanQuerySql", () => {
    it("strips trailing semicolons and whitespace", () => {
      expect(cleanQuerySql("SELECT * FROM users;")).toBe("SELECT * FROM users");
      expect(cleanQuerySql("SELECT * FROM users;;;  ")).toBe("SELECT * FROM users");
    });
  });

  describe("buildPaginatedQuery", () => {
    it("builds MySQL paginated query with limit and offset", () => {
      const sql = buildPaginatedQuery("SELECT * FROM users;", "mysql", 400, 0, null);
      expect(sql).toBe("SELECT * FROM (\nSELECT * FROM users\n) AS _datastudio_page LIMIT 400;");

      const page2 = buildPaginatedQuery("SELECT * FROM users;", "mysql", 400, 400, null);
      expect(page2).toBe("SELECT * FROM (\nSELECT * FROM users\n) AS _datastudio_page LIMIT 400 OFFSET 400;");
    });

    it("builds ANSI/Postgres paginated query with sorting", () => {
      const sql = buildPaginatedQuery("SELECT id, name FROM users", "ansi", 200, 0, { column: "name", descending: false });
      expect(sql).toBe('SELECT * FROM (\nSELECT id, name FROM users\n) AS _datastudio_page ORDER BY "name" ASC LIMIT 200;');

      const desc = buildPaginatedQuery("SELECT id, name FROM users", "ansi", 200, 200, { column: "created_at", descending: true });
      expect(desc).toBe('SELECT * FROM (\nSELECT id, name FROM users\n) AS _datastudio_page ORDER BY "created_at" DESC LIMIT 200 OFFSET 200;');
    });

    it("builds T-SQL paginated query with OFFSET FETCH and fallback ORDER BY", () => {
      const unsorted = buildPaginatedQuery("SELECT * FROM users", "tsql", 100, 0, null);
      expect(unsorted).toBe("SELECT * FROM (\nSELECT * FROM users\n) AS _datastudio_page ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY;");

      const sorted = buildPaginatedQuery("SELECT * FROM users", "tsql", 100, 200, { column: "id", descending: false });
      expect(sorted).toBe("SELECT * FROM (\nSELECT * FROM users\n) AS _datastudio_page ORDER BY [id] ASC OFFSET 200 ROWS FETCH NEXT 100 ROWS ONLY;");
    });
  });

  describe("buildCountQuery", () => {
    it("wraps clean SQL in COUNT(*)", () => {
      expect(buildCountQuery("SELECT * FROM users;")).toBe("SELECT COUNT(*) AS total FROM (\nSELECT * FROM users\n) AS _subquery_count;");
    });
  });
});
