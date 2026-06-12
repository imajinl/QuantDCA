import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

async function selectApple(page: import("@playwright/test").Page) {
  await page.getByRole("textbox", { name: "Asset Search", exact: true }).fill("AAPL");
  await page.getByRole("button", { name: /AAPL.US/i }).click();
  await expect(page.getByText("AAPL.US", { exact: true })).toBeVisible();
}

async function selectMicrosoft(page: import("@playwright/test").Page) {
  await page.getByRole("textbox", { name: "Asset Search", exact: true }).fill("MSFT");
  await page.getByRole("button", { name: /MSFT.US/i }).click();
  await expect(page.getByText("MSFT.US", { exact: true })).toBeVisible();
}

test("marketing website links into the working backtester", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Would DCA Have Beaten Lump Sum? Find Out Exactly." })).toBeVisible();
  await expect(page.getByText("Free / no account needed").first()).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Methodology" })).toHaveAttribute("href", "/methodology");

  await page.getByRole("link", { name: "Run Backtests" }).first().click();
  await expect(page.getByRole("heading", { name: "Strategy Comparison Console" })).toBeVisible();
});

test("user can search, select an asset, configure DCA, and compare strategies", async ({ page }) => {
  await page.goto("/app");
  await selectApple(page);

  await page.locator('input[type="date"]').nth(0).fill("2022-01-03");
  await page.locator('input[type="date"]').nth(1).fill("2024-12-31");
  await page.locator('input[type="number"]').nth(1).fill("600");
  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();

  await expect(page.getByText("Best Outcome")).toBeVisible();
  await expect(page.getByText("Focused Value")).toBeVisible();
  await expect(page.getByText("Formatting: Title Case headings, data-first values, straight quotes, and spaced / separators.")).toBeVisible();
  await expect(page.getByTestId("portfolio-chart").locator("path")).toHaveCount(2);
  await expect(page.getByRole("table", { name: "Results Comparison" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Purchase Schedule" })).toBeVisible();
  await expect(page.getByRole("row", { name: /AAPL.US Monthly DCA/i })).toBeVisible();
  await expect(page.getByRole("row", { name: /AAPL.US Lump Sum/i })).toBeVisible();
});

test("user can compare two selected assets across two strategies", async ({ page }) => {
  await page.goto("/app");
  await selectApple(page);
  await selectMicrosoft(page);

  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();

  await expect(page.getByTestId("portfolio-chart").locator("path")).toHaveCount(4);
  await expect(page.getByRole("row", { name: /AAPL.US Monthly DCA/i })).toBeVisible();
  await expect(page.getByRole("row", { name: /AAPL.US Lump Sum/i })).toBeVisible();
  await expect(page.getByRole("row", { name: /MSFT.US Monthly DCA/i })).toBeVisible();
  await expect(page.getByRole("row", { name: /MSFT.US Lump Sum/i })).toBeVisible();
});

test("error state renders for invalid input", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Select at least one asset.");
});

test("asset search explains when the API route returns the web app HTML", async ({ page }) => {
  await page.route("**/api/assets/search**", async (route) => {
    await route.fulfill({
      body: "<!doctype html><html><body>QuantDCA</body></html>",
      contentType: "text/html",
      status: 200
    });
  });

  await page.goto("/app");
  await page.getByRole("textbox", { name: "Asset Search", exact: true }).fill("AAPL");

  await expect(page.getByRole("alert")).toHaveText(
    "Asset search could not reach the QuantDCA API. The /api route returned HTML instead of JSON, so the backend is not being served for this environment."
  );
});

test("mobile viewport remains usable", async ({ page }) => {
  await page.goto("/app");
  await selectApple(page);
  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();
  await expect(page.getByRole("table", { name: "Results Comparison" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("user can export comparison data as CSV", async ({ page }) => {
  await page.goto("/app");
  await selectApple(page);
  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Comparison CSV", exact: true }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("quantdca-comparison.csv");
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const csv = readFileSync(filePath!, "utf8");
  expect(csv).toContain("Asset,Asset Name,Strategy,Price Basis");
  expect(csv).toContain("AAPL.US");
  expect(csv).toContain("Adjusted Close");
});

test("question mark help is selective and explains non-obvious assumptions", async ({ page }) => {
  await page.goto("/app");

  await expect(page.locator('button[aria-label^="Help:"]')).toHaveCount(11);
  await expect(page.getByRole("button", { name: "Help: Asset Search", exact: true })).toHaveCount(0);

  const help = page.getByRole("button", { name: "Help: Custom CSV Upload", exact: true });
  await expect(help).toHaveAttribute("title", /row 1 is ignored/);
  await help.click();
  await expect(help).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("column A starts with YYYY-MM-DD dates")).toBeVisible();

  await selectApple(page);
  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();
  await expect(page.getByRole("table", { name: "Results Comparison" })).toBeVisible();
  const postRunHelpCount = await page.locator('button[aria-label^="Help:"]').count();
  expect(postRunHelpCount).toBeLessThanOrEqual(16);
});

test("user can upload a custom CSV and run a backtest", async ({ page }, testInfo) => {
  const csvPath = testInfo.outputPath("custom-prices.csv");
  writeFileSync(csvPath, customCsvFixture());

  await page.goto("/app");
  await page.locator('input[type="file"]').setInputFiles(csvPath);
  await expect(page.getByText(/Loaded 49 price rows from 2021-01-04 to 2025-01-04/)).toBeVisible();
  await expect(page.getByText("CSV-CUSTOM-PRICES", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();

  await expect(page.getByRole("table", { name: "Results Comparison" })).toBeVisible();
  await expect(page.getByRole("row", { name: /CSV-CUSTOM-PRICES Monthly DCA/i })).toBeVisible();
  await expect(page.getByRole("row", { name: /CSV-CUSTOM-PRICES Lump Sum/i })).toBeVisible();
});

test("custom CSV upload gives specific parsing feedback", async ({ page }, testInfo) => {
  const csvPath = testInfo.outputPath("bad-custom-prices.csv");
  writeFileSync(csvPath, "Date,Price\n2024/11/29,100\n");

  await page.goto("/app");
  await page.locator('input[type="file"]').setInputFiles(csvPath);

  await expect(page.getByRole("alert")).toHaveText(
    'Row 2 column A must start with a date in YYYY-MM-DD format. Received "2024/11/29".'
  );
});

function customCsvFixture() {
  const rows = ["Date,Price,Ignored"];
  for (let month = 0; month <= 48; month += 1) {
    const date = new Date(Date.UTC(2021, month, 4)).toISOString().slice(0, 10);
    rows.push(`${date} 00:00:00 UTC,${100 + month},ignored`);
  }
  return `${rows.join("\n")}\n`;
}
