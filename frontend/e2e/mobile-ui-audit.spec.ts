import { expect, test, type Page, type TestInfo } from "@playwright/test";

const PHONE_ONLY = "Phone-only UI audit";

function isPhoneProject(projectName: string) {
  return projectName.startsWith("phone");
}

function solve(prompt: string): string {
  const numbers = (prompt.match(/\d+/g) || []).map(Number);
  if (prompt.includes("÷")) return String(numbers[0] / numbers[1]);
  if (prompt.startsWith("?")) return String(numbers[1] / numbers[0]);
  if (prompt.includes("x ?")) return String(numbers[1] / numbers[0]);
  return String(numbers[0] * numbers[1]);
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Test Parent/ }).click();
  await page.getByPlaceholder("Passcode").fill("246824");
  await page.getByRole("button", { name: "Continue as Test Parent" }).click();
  await expect(page.getByRole("heading", { name: "Buddy" })).toBeVisible();
}

async function answerVisibleQuestion(page: Page) {
  const prompt = await page.locator(".questionText").innerText();
  const answer = page.getByRole("textbox", { name: "Answer" });
  await answer.fill(solve(prompt));
  await answer.press("Enter");
}

async function continuePastEvolution(page: Page) {
  if (await page.locator(".evolutionPage").isVisible()) {
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

async function selectDashboardView(page: Page, value: "accuracy" | "speed" | "progress" | "retention") {
  await page.getByLabel("Dashboard view", { exact: true }).selectOption(value);
}

async function auditScreen(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const overflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const pageOverflow = document.documentElement.scrollWidth - viewportWidth;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const internalOverflow = element.scrollWidth > element.clientWidth + 1 && style.overflowX !== "hidden";
        const outsideViewport = rect.left < -1 || rect.right > viewportWidth + 1;
        return rect.width > 0 && rect.height > 0 && (internalOverflow || outsideViewport);
      })
      .map((element) => ({
        element: `${element.tagName.toLowerCase()}.${Array.from(element.classList).join(".")}`,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
      }));
    return { pageOverflow, elements };
  });
  expect.soft(overflow, `${name} has horizontal overflow`).toEqual({ pageOverflow: 0, elements: [] });
}

test.beforeEach(async ({ request }) => {
  const users = await request.get("/backend-api/users");
  const profiles = await users.json();
  if (!profiles.some((user: { name: string }) => user.name === "Test Parent")) {
    await request.post("/backend-api/users", { data: { name: "Test Parent", password: "246824" } });
  }
});

test("all primary screens fit a phone without horizontal scrolling", async ({ page }, testInfo) => {
  test.skip(!isPhoneProject(testInfo.project.name), PHONE_ONLY);

  await page.goto("/");
  await auditScreen(page, testInfo, "01-profile-picker");
  await page.getByRole("button", { name: /Test Parent/ }).click();
  await auditScreen(page, testInfo, "02-passcode");
  await page.getByPlaceholder("Passcode").fill("246824");
  await page.getByRole("button", { name: "Continue as Test Parent" }).click();
  await expect(page.getByRole("heading", { name: "Buddy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your reviews are planned" })).toBeVisible();
  await auditScreen(page, testInfo, "03-home");

  await page.locator(".collapsiblePanel summary").click();
  await auditScreen(page, testInfo, "04-table-selection");
  await page.locator(".collapsiblePanel summary").click();

  await page.getByText("Settings", { exact: true }).click();
  await auditScreen(page, testInfo, "05-settings-admin");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await auditScreen(page, testInfo, "06-creature-profile");

  await page.getByText("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".dashboard .metricGrid")).toBeVisible();
  await auditScreen(page, testInfo, "07-dashboard-overview");
  for (const [value, label] of [["accuracy", "Accuracy"], ["speed", "Speed"], ["progress", "Progress"]] as const) {
    await selectDashboardView(page, value);
    await auditScreen(page, testInfo, `08-dashboard-${label.toLowerCase()}`);
  }

  await page.getByRole("button", { name: "Back home", exact: true }).click();
  await page.locator(".modeSelect select").selectOption("practice");
  await auditScreen(page, testInfo, "09-practice-setup");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.locator(".questionText")).not.toHaveText("Loading...");
  await auditScreen(page, testInfo, "10-practice-question");
});

test("challenge and quest screens fit a phone", async ({ page }, testInfo) => {
  test.skip(!isPhoneProject(testInfo.project.name), PHONE_ONLY);
  await login(page);

  await page.locator(".modeSelect select").selectOption("challenge");
  await expect(page.getByRole("heading", { name: "Choose your challenge length" })).toBeVisible();
  await auditScreen(page, testInfo, "11-challenge-setup");
  await page.getByRole("button", { name: "Start challenge" }).click();
  await expect(page.locator(".questionText")).toBeVisible();
  await auditScreen(page, testInfo, "12-challenge-question");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Back to home" }).click();
  await page.getByRole("button", { name: "Start quest" }).first().click();
  await expect(page.locator(".questionText")).toBeVisible();
  await auditScreen(page, testInfo, "13-quest-question");

  const prompt = await page.locator(".questionText").innerText();
  await page.getByRole("textbox", { name: "Answer" }).fill(solve(prompt));
  await page.getByRole("textbox", { name: "Answer" }).press("Enter");
  await expect(page.locator(".practiceControls")).toContainText("2 /");
});

test("completion and results screens fit a phone", async ({ page }, testInfo) => {
  test.skip(!isPhoneProject(testInfo.project.name), PHONE_ONLY);
  test.setTimeout(60_000);
  await login(page);

  await page.getByRole("button", { name: /Quick Boost/ }).click();
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.locator(".questionText")).not.toHaveText("Loading...");
  for (let index = 0; index < 5; index += 1) {
    await answerVisibleQuestion(page);
    if (index < 4) {
      await expect(page.locator(".progressLine")).toHaveText(`${index + 2} of 5`);
      await expect(page.getByRole("textbox", { name: "Answer" })).toBeEditable();
    }
  }
  await expect(page.getByRole("heading", { name: "Practice complete" })).toBeVisible();
  await auditScreen(page, testInfo, "14-practice-complete");
  await page.getByRole("button", { name: "Back to home" }).click();
  await continuePastEvolution(page);
  await expect(page.getByRole("heading", { name: "Buddy" })).toBeVisible();

  await page.locator(".modeSelect select").selectOption("challenge");
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Start challenge" }).click();
  for (let index = 0; index < 10; index += 1) {
    await answerVisibleQuestion(page);
    if (index < 9) await expect(page.locator(".progressLine")).toHaveText(`${index + 2} of 10`);
  }
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible();
  await auditScreen(page, testInfo, "15-challenge-results");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await continuePastEvolution(page);
  await expect(page.getByRole("heading", { name: "Buddy" })).toBeVisible();

  await page.getByRole("button", { name: "Start quest" }).first().click();
  const questionCount = Number((await page.locator(".practiceControls").innerText()).split("/")[1].trim());
  for (let index = 0; index < questionCount; index += 1) {
    await answerVisibleQuestion(page);
    if (index < questionCount - 1) await expect(page.locator(".practiceControls")).toContainText(`${index + 2} /`);
  }
  await expect(page.getByRole("heading", { name: /completed a training quest/ })).toBeVisible();
  await auditScreen(page, testInfo, "16-quest-complete");
});

test("parent can schedule a fixed recall check that a learner completes on a small phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-small", "Small-phone retention workflow");
  test.setTimeout(90_000);
  const learnerName = `Recall Learner ${Date.now()}`;
  await login(page);

  await page.getByText("Settings", { exact: true }).click();
  await page.getByPlaceholder("Profile name").fill(learnerName);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".adminPanel .feedback")).toHaveText("Profile created.");
  const learnerRow = page.locator(".adminUserRow").filter({ hasText: learnerName });
  await learnerRow.getByRole("button", { name: "View dashboard" }).click();
  await selectDashboardView(page, "retention");
  await expect(page.getByRole("heading", { name: "Memory tests" })).toBeVisible();
  await auditScreen(page, testInfo, "17-retention-parent-setup");
  await page.locator(".retentionSetup select").first().selectOption("10");
  await page.getByRole("button", { name: "Create baseline test" }).click();
  await expect(page.getByText(`Baseline ready for ${learnerName}.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start test" })).toBeFocused();
  await auditScreen(page, testInfo, "18-retention-scheduled");

  await page.getByText("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("button", { name: new RegExp(learnerName) }).click();
  await page.getByRole("button", { name: `Continue as ${learnerName}` }).click();
  await expect(page.getByRole("heading", { name: "Baseline test is ready" })).toBeVisible();
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page.locator(".questionText")).toBeVisible();
  await auditScreen(page, testInfo, "19-retention-question");

  for (let index = 0; index < 10; index += 1) {
    await answerVisibleQuestion(page);
    if (index < 9) await expect(page.locator(".progressLine")).toHaveText(`${index + 2} of 10`);
  }
  await expect(page.getByRole("heading", { name: "Recall check complete" })).toBeVisible();
  await auditScreen(page, testInfo, "20-retention-complete");
  await page.getByRole("button", { name: "See results" }).click();
  await selectDashboardView(page, "retention");
  await expect(page.getByText("4-week check:")).toBeVisible();
  await expect(page.getByText("Starting point")).toBeVisible();
  await auditScreen(page, testInfo, "21-retention-results");
});
