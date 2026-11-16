import { strToU8, zipSync } from "fflate";
import type { ColumnInfo, Value } from "../../core/contract";
import { displayValue } from "../../core/values";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function escapeXml(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- XML 1.0 forbids these code points.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function cell(ref: string, value: Value): string {
  if (value.t === "null") return `<c r="${ref}"/>`;
  if (value.t === "bool") return `<c r="${ref}" t="b"><v>${value.v ? 1 : 0}</v></c>`;
  const text = displayValue(value) ?? "";
  // Excel preserves only 15 significant numeric digits; longer IDs stay literal text.
  if (["int", "float", "decimal"].includes(value.t) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text) && text.replace(/[^0-9]/g, "").length <= 15) {
    return `<c r="${ref}" t="n"><v>${text}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

/** A genuine Open XML workbook; strings are never formulas. */
export function exportXlsx(columns: ColumnInfo[], rows: Value[][]): Uint8Array {
  const exported = columns.map((column, index) => ({ column, index })).filter(({ column }) => column.hints.vectorDims == null);
  if (exported.length > 16384 || rows.length > 1048575) throw new Error("Excel supports at most 16,384 columns and 1,048,575 data rows plus the header");
  const header = exported.map(({ column }, index) => cell(`${columnName(index)}1`, { t: "text", v: column.name })).join("");
  const data = rows
    .map(
      (row, index) =>
        `<row r="${index + 2}">${exported.map(({ index: source }, col) => cell(`${columnName(col)}${index + 2}`, row[source] ?? { t: "null", v: null })).join("")}</row>`,
    )
    .join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(`${XML}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="Results" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(`${XML}<worksheet xmlns="${NS}"><sheetData><row r="1">${header}</row>${data}</sheetData></worksheet>`),
  });
}

export function bytesBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(chunks.join(""));
}
