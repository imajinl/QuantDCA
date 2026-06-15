import { describe, expect, it } from "vitest";
import { CustomCsvParseError, parseCustomPriceCsv } from "./customCsv";

describe("parseCustomPriceCsv", () => {
  it("ignores the title row, extra date text, and extra columns", () => {
    const parsed = parseCustomPriceCsv(
      "Date,Price,Volume\n2024-11-29 00:00:00 UTC,123.45,999\n2024-12-02,124.5,ignored\n"
    );

    expect(parsed).toEqual({
      firstDate: "2024-11-29",
      lastDate: "2024-12-02",
      rowCount: 2,
      prices: [
        { date: "2024-11-29", close: 123.45 },
        { date: "2024-12-02", close: 124.5 }
      ]
    });
  });

  it("reports a specific date format error", () => {
    expect(() => parseCustomPriceCsv("Date,Price\n11/29/2024,123\n")).toThrow(
      new CustomCsvParseError('Row 2 column A must start with a date in YYYY-MM-DD format. Received "11/29/2024".')
    );
  });

  it("reports a specific price error", () => {
    expect(() => parseCustomPriceCsv("Date,Price\n2024-11-29,free\n")).toThrow(
      new CustomCsvParseError('Row 2 column B must be a positive USD price. Received "free".')
    );
  });

  it("parses quoted comma prices and sorts rows", () => {
    const parsed = parseCustomPriceCsv('Date,Price\n2024-12-02,125\n2024-11-29,"$1,234.56"\n');

    expect(parsed.prices).toEqual([
      { date: "2024-11-29", close: 1234.56 },
      { date: "2024-12-02", close: 125 }
    ]);
    expect(parsed.firstDate).toBe("2024-11-29");
    expect(parsed.lastDate).toBe("2024-12-02");
  });

  it("rejects unquoted thousands separators that split the price column", () => {
    expect(() => parseCustomPriceCsv("Date,Price\n2024-11-29,1,234.56\n")).toThrow(
      new CustomCsvParseError(
        'Row 2 column B appears to use an unquoted comma thousands separator. Quote prices like "$1,234.56" or remove the comma.'
      )
    );
  });

  it("reports duplicate dates and unterminated quoted fields", () => {
    expect(() => parseCustomPriceCsv("Date,Price\n2024-11-29,123\n2024-11-29,124\n")).toThrow(
      new CustomCsvParseError("Row 3 column A repeats date 2024-11-29. Each price date must be unique.")
    );
    expect(() => parseCustomPriceCsv('Date,Price\n2024-11-29,"123\n')).toThrow(
      new CustomCsvParseError("CSV has an unterminated quoted field.")
    );
  });
});
