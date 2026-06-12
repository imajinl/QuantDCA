import type { PricePoint } from "./backtest";

export interface ParsedCustomCsv {
  prices: PricePoint[];
  firstDate: string;
  lastDate: string;
  rowCount: number;
}

export class CustomCsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomCsvParseError";
  }
}

export function parseCustomPriceCsv(csvText: string): ParsedCustomCsv {
  const rows = parseCsvRows(csvText);
  if (rows.length <= 1) {
    throw new CustomCsvParseError("CSV must include a title row plus at least one data row starting at A2 / B2.");
  }

  const prices: PricePoint[] = [];
  const seenDates = new Set<string>();

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.every((cell) => cell.trim() === "")) {
      return;
    }

    const dateCell = row[0]?.trim() ?? "";
    const priceCell = row[1]?.trim() ?? "";
    const date = parseDateCell(dateCell, rowNumber);
    const price = parsePriceCell(priceCell, rowNumber);

    if (seenDates.has(date)) {
      throw new CustomCsvParseError(`Row ${rowNumber} column A repeats date ${date}. Each price date must be unique.`);
    }

    seenDates.add(date);
    prices.push({ date, close: price });
  });

  if (prices.length === 0) {
    throw new CustomCsvParseError("CSV must include at least one non-empty data row after the ignored title row.");
  }

  prices.sort((left, right) => left.date.localeCompare(right.date));

  return {
    prices,
    firstDate: prices[0].date,
    lastDate: prices[prices.length - 1].date,
    rowCount: prices.length
  };
}

function parseDateCell(cell: string, rowNumber: number): string {
  if (!cell) {
    throw new CustomCsvParseError(`Row ${rowNumber} column A is empty. Provide a date starting with YYYY-MM-DD.`);
  }

  const dateToken = cell.split(/\s+/)[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateToken)) {
    throw new CustomCsvParseError(
      `Row ${rowNumber} column A must start with a date in YYYY-MM-DD format. Received "${cell}".`
    );
  }

  const timestamp = Date.parse(`${dateToken}T00:00:00.000Z`);
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== dateToken) {
    throw new CustomCsvParseError(`Row ${rowNumber} column A is not a valid calendar date. Received "${dateToken}".`);
  }

  return dateToken;
}

function parsePriceCell(cell: string, rowNumber: number): number {
  if (!cell) {
    throw new CustomCsvParseError(`Row ${rowNumber} column B is empty. Provide a positive USD price.`);
  }

  const normalized = cell.replace(/^\$/, "").replace(/,/g, "").trim();
  const price = Number(normalized);
  if (!Number.isFinite(price) || price <= 0) {
    throw new CustomCsvParseError(`Row ${rowNumber} column B must be a positive USD price. Received "${cell}".`);
  }

  return price;
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  if (inQuotes) {
    throw new CustomCsvParseError("CSV has an unterminated quoted field.");
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
