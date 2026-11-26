import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("viewer launches a profile, plays and saves a clip, reranks and resets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Fresh Start/ }).click();
  await expect(page.getByRole("heading", { name: "For You" })).toBeVisible();
  await page.getByRole("button", { name: "Play The Blue Hour" }).click();
  const media = page.locator("video");
  await expect(media).toBeVisible();
  await expect.poll(() => media.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThan(1);
  await media.evaluate(async (video: HTMLVideoElement) => { video.playbackRate = 8; await video.play(); });
  await expect(page.getByText("Clip finished · The Blue Hour").last()).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: /Refresh for You/ }).click();
  await expect(page.getByText(/Feed refreshed/).last()).toBeVisible();
  await page.getByLabel("Freeze candidate pool").check();
  await page.getByLabel("Exploration", { exact: true }).focus();
  await page.keyboard.press("End");
  await expect(page.locator('output[for="feed-exploration"]')).toHaveText("100%");
  await page.getByRole("link", { name: "Open full rank inspector" }).click();
  await expect(page.getByRole("heading", { name: "Score breakdown" })).toBeVisible();
  await page.getByRole("link", { name: "Preferences", exact: true }).click();
  await expect(page.getByRole("link", { name: "The Blue Hour" })).toBeVisible();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("No activity yet.")).toBeVisible();
});

test("lab renders data and exports a reproducible synthetic comparison", async ({ page }, testInfo) => {
  await page.goto("/lab/evaluation/");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("Split").selectOption("validation");
  await expect(page.getByRole("caption")).toHaveText(/validation/);
  if (process.env.FEEDCRAFT_SCREENSHOTS) await page.screenshot({ path: testInfo.outputPath("evaluation.png"), fullPage: true });
  await page.getByRole("link", { name: "Policy Simulator" }).click();
  await page.getByRole("button", { name: "After event 2" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export experiment JSON" }).click();
  expect((await download).suggestedFilename()).toBe("feedcraft-experiment.json");
});

test("discovery passes automated accessibility checks and fits the viewport", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find your next watch." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations).toEqual([]);
  if (process.env.FEEDCRAFT_SCREENSHOTS) await page.screenshot({ path: testInfo.outputPath("discovery.png"), fullPage: true });
});

test("the optional API ranks the viewer's synchronized demo events", async ({ page }) => {
  test.skip(!process.env.FEEDCRAFT_TEST_API, "Local API integration fixture is disabled");
  await page.goto("/profile/");
  await page.getByLabel(/Use local API/).check();
  await page.getByRole("link", { name: "For You", exact: true }).click();
  await page.getByRole("button", { name: "♡ Like", exact: true }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: /Refresh for You/ }).click();
  await expect(page.getByText("synthetic-als-v1", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Preferences", exact: true }).click();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("No activity yet.")).toBeVisible();
});
