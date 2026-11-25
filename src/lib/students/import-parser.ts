import "server-only";

import ExcelJS from "exceljs";
import { ApiRequestError } from "@/lib/api/http";

export const MAX_STUDENT_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_STUDENT_IMPORT_ROWS = 500;
const MAX_COLUMNS = 32;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
    if (value.length > 10_000) throw new ApiRequestError("A spreadsheet cell exceeds the allowed size.", 400);
  }
  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  if (quoted) throw new ApiRequestError("The CSV contains an unclosed quoted field.", 400);
  if (rows.some((cells) => cells.length > MAX_COLUMNS)) {
    throw new ApiRequestError(`Imports may contain at most ${MAX_COLUMNS} columns.`, 400);
  }
  return rows;
}

function excelCellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value instanceof Date && Number.isFinite(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim();
  }
  throw new ApiRequestError("Formulas and non-text spreadsheet cells are not allowed in student imports.", 400);
}

export async function readStudentImport(file: File) {
  if (file.size === 0) throw new ApiRequestError("The selected file is empty.", 400);
  if (file.size > MAX_STUDENT_IMPORT_BYTES) throw new ApiRequestError("File size must be 5 MB or less.", 413);
  const filename = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let rows: string[][];

  if (filename.endsWith(".csv")) {
    const mime = file.type.toLowerCase();
    if (mime && !["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream"].includes(mime)) {
      throw new ApiRequestError("CSV file content type is not allowed.", 415);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    rows = parseCsv(text);
  } else if (filename.endsWith(".xlsx")) {
    const mime = file.type.toLowerCase();
    if (mime && !["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"].includes(mime)) {
      throw new ApiRequestError("XLSX file content type is not allowed.", 415);
    }
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      throw new ApiRequestError("The XLSX file signature is invalid.", 415);
    }
    const workbook = new ExcelJS.Workbook();
    try {
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      await workbook.xlsx.load(buffer);
    } catch {
      throw new ApiRequestError("The XLSX file is invalid or could not be opened.", 400);
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ApiRequestError("The workbook has no worksheet.", 400);
    if (sheet.rowCount > MAX_STUDENT_IMPORT_ROWS + 1) {
      throw new ApiRequestError(`Imports are limited to ${MAX_STUDENT_IMPORT_ROWS} student rows.`, 413);
    }
    if (sheet.columnCount > MAX_COLUMNS) {
      throw new ApiRequestError(`Imports may contain at most ${MAX_COLUMNS} columns.`, 400);
    }
    rows = [];
    for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const excelRow = sheet.getRow(rowNumber);
      const cells = Array.from({ length: sheet.columnCount }, (_, index) =>
        excelCellToString(excelRow.getCell(index + 1).value),
      );
      if (cells.some((cell) => cell !== "")) rows.push(cells);
    }
  } else {
    throw new ApiRequestError("Only CSV and XLSX spreadsheet files are supported.", 415);
  }

  if (rows.length > MAX_STUDENT_IMPORT_ROWS + 1) {
    throw new ApiRequestError(`Imports are limited to ${MAX_STUDENT_IMPORT_ROWS} student rows.`, 413);
  }
  return rows;
}
