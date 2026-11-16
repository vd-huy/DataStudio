import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import type { ColumnInfo } from "../../core/contract";
import { exportXlsx } from "./xlsx";

const column = (name: string): ColumnInfo => ({
  name,
  typeName: "text",
  kind: { kind: "text" },
  nullable: true,
  default: null,
  comment: null,
  identity: null,
  generated: null,
  hints: {},
});

describe("Excel workbook export", () => {
  it("writes a real workbook with Unicode, typed cells and literal formula-like text", () => {
    const files = unzipSync(
      exportXlsx(
        [column("Họ tên"), column("value"), column("active"), column("empty")],
        [
          [
            { t: "text", v: "An & <B>" },
            { t: "int", v: 42 },
            { t: "bool", v: true },
            { t: "null", v: null },
          ],
          [
            { t: "text", v: "=HYPERLINK(1)" },
            { t: "int", v: "9223372036854775807" },
            { t: "bool", v: false },
            { t: "null", v: null },
          ],
        ],
      ),
    );
    expect(files["[Content_Types].xml"]).toBeDefined();
    expect(files["xl/workbook.xml"]).toBeDefined();
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("Họ tên");
    expect(sheet).toContain("An &amp; &lt;B&gt;");
    expect(sheet).toContain('<c r="B2" t="n"><v>42</v></c>');
    expect(sheet).toContain('<c r="C2" t="b"><v>1</v></c>');
    expect(sheet).toContain("9223372036854775807");
    expect(sheet).toContain("=HYPERLINK(1)");
    expect(sheet).not.toContain("<f>");
  });

  it("keeps headers for zero rows and supports columns after Z", () => {
    const files = unzipSync(
      exportXlsx(
        Array.from({ length: 27 }, (_, index) => column(`c${index}`)),
        [],
      ),
    );
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain('r="AA1"');
  });
});
