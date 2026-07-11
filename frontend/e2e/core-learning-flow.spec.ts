import { expect, test } from "@playwright/test";

function solve(prompt: string): string {
  const numbers = [...prompt.matchAll(/\d+/g)].map((match) => Number(match[0]));
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
