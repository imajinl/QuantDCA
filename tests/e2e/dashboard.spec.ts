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

  await expect(page.getByRole("heading", { name: "DCA or lump sum? Run the receipts." })).toBeVisible();
  await expect(page.getByText("S&P 500 or any supported asset")).toBeVisible();
  await expect(page.getByText("Free — no account needed to run a comparison.").first()).toBeVisible();
  await expect(page.getByText("quantdca.xyz")).toBeVisible();
  await expect(page.getByText("S&P 500 · Lump Sum").first()).toBeVisible();
  await expect(page.getByText("Search + CSV")).toBeVisible();
  await expect(page.getByText("Step 04")).toBeVisible();
  await expect(page.getByRole("link", { name: "About" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Brand" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Product" })).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Methodology" })).toHaveAttribute("href", "#methodology");

  await page.getByRole("link", { name: "Run Backtests" }).first().click();
  await expect(page.getByRole("heading", { name: "Strategy Comparison Console" })).toBeVisible();
});

test("legacy public routes collapse to the minimal landing page", async ({ page }) => {
  await page.goto("/about");

  await expect(page.getByRole("heading", { name: "DCA or lump sum? Run the receipts." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Principles" })).toHaveCount(0);
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
  await expect(page.getByTestId("portfolio-chart").locator("path")).toHaveCount(2);
  await expect(page.getByRole("table", { name: "Results Comparison" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Purchase Schedule" })).toBeVisible();
  await expect(page.getByRole("row", { name: /AAPL.US Monthly DCA/i })).toBeVisible();
  await expect(page.getByRole("row", { name: /AAPL.US Lump Sum/i })).toBeVisible();
});

test("asset search explains empty result sets", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("textbox", { name: "Asset Search", exact: true }).fill("ZZZZZZ");
  await expect(page.getByText('No assets found for "ZZZZZZ".')).toBeVisible();
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

test("strategy controls expose inline validation and keyboard radio behavior", async ({ page }) => {
  await page.goto("/app");
  await selectApple(page);

  const firstInitial = page.getByLabel("Initial Investment").first();
  const firstRecurring = page.getByLabel("Recurring Contribution").first();
  await firstInitial.fill("0");
  await firstRecurring.fill("0");
  await expect(page.getByText("At least one investment amount must be greater than zero.").first()).toBeVisible();

  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Monthly DCA: At least one investment amount must be greater than zero." })).toBeVisible();

  const dcaRadio = page.getByRole("radio", { name: "DCA" }).first();
  const lumpSumRadio = page.getByRole("radio", { name: "Lump Sum" }).first();
  await dcaRadio.focus();
  await page.keyboard.press("ArrowRight");
  await expect(lumpSumRadio).toHaveAttribute("aria-checked", "true");
  await expect(lumpSumRadio).toBeFocused();
});

test("existing results are marked stale after inputs change", async ({ page }) => {
  await page.goto("/app");
  await selectApple(page);
  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();
  await expect(page.getByRole("table", { name: "Results Comparison" })).toBeVisible();

  await page.locator('input[type="number"]').nth(1).fill("650");

  await expect(page.getByText("Inputs changed since this run. Run Backtests again to refresh the comparison.")).toBeVisible();
});

test("keyboard users can choose the focused result row", async ({ page }) => {
  await page.goto("/app");
  await selectApple(page);
  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();
  await expect(page.getByRole("table", { name: "Results Comparison" })).toBeVisible();

  const lumpSumRow = page.getByRole("row", { name: /AAPL.US Lump Sum/i });
  await lumpSumRow.focus();
  await page.keyboard.press("Enter");

  await expect(lumpSumRow).toHaveAttribute("aria-selected", "true");
  await expect(lumpSumRow).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("Focused Run").first()).toBeVisible();
});

test("partial asset failures are shown without hiding successful runs", async ({ page }) => {
  await page.route("**/api/backtests", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        generatedAt: "2026-06-15T12:00:00.000Z",
        results: [apiResultFixture()],
        errors: [{ code: "no_data", message: "No historical data found for MSFT.US.", status: 422, symbol: "MSFT.US" }]
      })
    });
  });

  await page.goto("/app");
  await selectApple(page);
  await selectMicrosoft(page);
  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();

  await expect(page.getByRole("table", { name: "Results Comparison" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(
    "Some assets could not be backtested. MSFT.US: No historical data found for MSFT.US."
  );
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

test("mobile tables scroll without losing run controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile project only");

  await page.goto("/app");
  await selectApple(page);
  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();
  await expect(page.getByRole("table", { name: "Results Comparison" })).toBeVisible();

  await expect(page.locator(".run-footer")).toHaveCSS("position", "sticky");
  await expect(page.getByTestId("portfolio-chart")).toBeVisible();

  const tableWrap = page.locator(".table-wrap").first();
  const canScrollTable = await tableWrap.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(canScrollTable).toBe(true);
  const scrolledLeft = await tableWrap.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  expect(scrolledLeft).toBeGreaterThan(0);
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
  await expect(help).toHaveAttribute("aria-describedby", /.+/);
  await expect(page.getByText("column A starts with YYYY-MM-DD dates")).toBeVisible();
  await help.press("Escape");
  await expect(help).toHaveAttribute("aria-expanded", "false");

  await expect(page.getByRole("radio", { name: "DCA" }).first()).toHaveAttribute("aria-checked", "true");

  await selectApple(page);
  await page.getByRole("button", { name: "Run Backtests", exact: true }).click();
  await expect(page.getByRole("table", { name: "Results Comparison" })).toBeVisible();
  const postRunHelpCount = await page.locator('button[aria-label^="Help:"]').count();
  expect(postRunHelpCount).toBeLessThanOrEqual(16);
});

test("custom CSV upload has visible keyboard focus styling", async ({ page }) => {
  await page.goto("/app");
  await page.locator('input[type="file"]').focus();

  await expect(page.locator(".file-drop")).toHaveCSS("border-color", "rgb(46, 99, 230)");
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

function apiResultFixture() {
  return {
    runId: "AAPL.US:monthly-dca",
    asset: { symbol: "AAPL.US", code: "AAPL", name: "Apple Inc.", exchange: "US", type: "Common Stock", currency: "USD" },
    strategyId: "monthly-dca",
    strategyName: "Monthly DCA",
    targetCapital: 200,
    priceSource: "adjusted-close",
    metrics: {
      totalInvested: 200,
      remainingCash: 0,
      finalValue: 220,
      totalReturn: 0.1,
      cagr: 0.1,
      maxDrawdown: -0.02,
      volatility: 0.12,
      bestTimingImpact: 0.1,
      worstTimingImpact: 0.05,
      numberOfPurchases: 2,
      averagePurchasePrice: 10,
      unitsAccumulated: 20,
      feesPaid: 0
    },
    transactions: [
      {
        id: "monthly-dca-1",
        strategyId: "monthly-dca",
        dueDate: "2024-01-01",
        date: "2024-01-01",
        grossAmount: 100,
        fee: 0,
        netAmount: 100,
        price: 10,
        units: 10
      },
      {
        id: "monthly-dca-2",
        strategyId: "monthly-dca",
        dueDate: "2024-02-01",
        date: "2024-02-01",
        grossAmount: 100,
        fee: 0,
        netAmount: 100,
        price: 10,
        units: 10
      }
    ],
    series: [
      {
        date: "2024-01-01",
        price: 10,
        investedCapital: 100,
        marketValue: 100,
        cashValue: 100,
        portfolioValue: 200,
        units: 10
      },
      {
        date: "2024-02-01",
        price: 11,
        investedCapital: 200,
        marketValue: 220,
        cashValue: 0,
        portfolioValue: 220,
        units: 20
      }
    ]
  };
}
