import { expect, test } from "@playwright/test";

function solve(prompt: string): string {
  const numbers = (prompt.match(/\d+/g) || []).map(Number);
  if (prompt.includes("÷")) return String(numbers[0] / numbers[1]);
  if (prompt.startsWith("?")) return String(numbers[1] / numbers[0]);
  if (prompt.includes("x ?")) return String(numbers[1] / numbers[0]);
  return String(numbers[0] * numbers[1]);
}

test.beforeEach(async ({ request }) => {
  const users = await request.get("/backend-api/users");
  if ((await users.json()).length === 0) {
    await request.post("/backend-api/users", { data: { name: "Test Parent", password: "246824" } });
  }
});

test("keyboard submission is acknowledged and advances practice", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Test Parent/ }).click();
  await page.getByPlaceholder("Passcode").fill("246824");
  await page.getByRole("button", { name: "Continue as Test Parent" }).click();
  await expect(page.getByRole("heading", { name: "Buddy" })).toBeVisible();

  await page.getByRole("button", { name: /Quick Boost/ }).click();
  await page.getByRole("button", { name: "Start practice" }).click();
  const question = page.locator(".questionText");
  await expect(question).not.toHaveText("Loading...");
  const prompt = await question.innerText();
  await page.getByRole("textbox", { name: "Answer" }).fill(solve(prompt));
  await page.getByRole("textbox", { name: "Answer" }).press("Enter");

  await expect(page.locator(".feedback")).toContainText("Correct.");
  await expect(page.locator(".progressLine")).toHaveText("2 of 5");
});

test("phone layouts stay within the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Phone-only viewport assertion");
  await page.goto("/");
  await page.getByRole("button", { name: /Test Parent/ }).click();
  await page.getByPlaceholder("Passcode").fill("246824");
  await page.getByRole("button", { name: "Continue as Test Parent" }).click();
  await page.getByRole("button", { name: /Quick Boost/ }).click();
  await page.getByRole("button", { name: "Start practice" }).click();

  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await expect(page.getByLabel("Number pad")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter" })).toBeVisible();
});

test("admin-required tables stay selected for the learner", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Admin workflow only needs one browser project");
  const learnerName = `Required Learner ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: /Test Parent/ }).click();
  await page.getByPlaceholder("Passcode").fill("246824");
  await page.getByRole("button", { name: "Continue as Test Parent" }).click();
  await page.getByText("Settings", { exact: true }).click();

  await page.getByPlaceholder("Profile name").fill(learnerName);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".adminPanel .feedback")).toHaveText("Profile created.");
  const learnerRow = page.locator(".adminUserRow").filter({ hasText: learnerName });
  await expect(learnerRow).toBeVisible();
  const adminTableButton = learnerRow.getByLabel(`Required tables for ${learnerName}`).getByRole("button", { name: "7 times table" });
  await adminTableButton.click();
  await expect(adminTableButton).toHaveClass(/selected/);
  await learnerRow.getByRole("button", { name: "Save", exact: true }).click();
  await expect(learnerRow.getByRole("button", { name: "7 times table" })).toHaveClass(/selected/);

  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("button", { name: new RegExp(learnerName) }).click();
  await page.getByRole("button", { name: `Continue as ${learnerName}` }).click();
  await page.locator(".collapsiblePanel summary").click();
  const requiredTable = page.getByRole("button", { name: "7 times table, required by admin" });
  await expect(requiredTable).toBeDisabled();
  await expect(requiredTable).toHaveAttribute("aria-pressed", "true");
});

test("heat map cells contain only the five-level colour data", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Dashboard rendering only needs one browser project");
  await page.goto("/");
  await page.getByRole("button", { name: /Test Parent/ }).click();
  await page.getByPlaceholder("Passcode").fill("246824");
  await page.getByRole("button", { name: "Continue as Test Parent" }).click();
  await page.getByText("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Accuracy", exact: true }).click();

  const cells = page.locator(".heatCell");
  await expect(cells.first()).toBeVisible();
  await expect(cells.first()).toHaveText("");
  await expect(page.locator(".heatLegend .heat0")).toBeVisible();
  await expect(page.locator(".heatLegend .heat4")).toBeVisible();
});

test("phone dashboard contains the heat map without widening the page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Phone-only dashboard assertion");
  await page.goto("/");
  await page.getByRole("button", { name: /Test Parent/ }).click();
  await page.getByPlaceholder("Passcode").fill("246824");
  await page.getByRole("button", { name: "Continue as Test Parent" }).click();
  await page.getByText("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Accuracy", exact: true }).click();

  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await expect(page.locator(".heatMapFrame")).toBeVisible();
});
