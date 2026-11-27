import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true }).click();
}

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
  await expect(page.locator(".rank-change").first()).toBeVisible();
  await page.getByRole("link", { name: "Open full rank inspector" }).click();
  await expect(page.getByRole("heading", { name: "Score breakdown" })).toBeVisible();
  await navigate(page, "Preferences");
  await expect(page.getByRole("link", { name: "The Blue Hour" })).toBeVisible();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("No activity yet.")).toBeVisible();
});

test("lab renders data and exports a reproducible synthetic comparison", async ({ page }, testInfo) => {
  await page.goto("/lab/evaluation/");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("Split").selectOption("validation");
  await expect(page.getByRole("caption")).toHaveText(/validation/);
  await page.getByLabel("Chart metric").selectOption("recall");
  await expect(page.getByLabel("Chart metric")).toHaveValue("recall");
  if (process.env.FEEDCRAFT_SCREENSHOTS) await page.screenshot({ path: testInfo.outputPath("evaluation.png"), fullPage: true });
  await navigate(page, "Policy Simulator");
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(page.getByRole("button", { name: "After event 1" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "After event 2" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export experiment JSON" }).click();
  expect((await download).suggestedFilename()).toBe("feedcraft-experiment.json");
});

test("discovery passes automated accessibility checks and fits the viewport", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The discovery feed." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations).toEqual([]);
  if (process.env.FEEDCRAFT_SCREENSHOTS) await page.screenshot({ path: testInfo.outputPath("discovery.png"), fullPage: true });
});

test("the optional API ranks the viewer's synchronized demo events", async ({ page }) => {
  test.skip(!process.env.FEEDCRAFT_TEST_API, "Local API integration fixture is disabled");
  await page.goto("/profile/");
  await page.getByLabel(/Use local API/).check();
  await navigate(page, "For You");
  await page.getByRole("button", { name: "♡ Like", exact: true }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: /Refresh for You/ }).click();
  await expect(page.getByText("synthetic-als-v1", { exact: true })).toBeVisible();
  await navigate(page, "Preferences");
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("No activity yet.")).toBeVisible();
});

test("carousel supports keyboard navigation and touch swipes", async ({ page }, testInfo) => {
  await page.goto("/feed/");
  await expect(page.getByRole("button", { name: "Refresh for You" })).toBeEnabled();
  const carousel = page.getByLabel(/Clip carousel/);
  if (testInfo.project.name === "mobile") {
    await carousel.evaluate((target) => {
      const start = new Touch({ identifier: 1, target, clientX: 270, clientY: 300 });
      const end = new Touch({ identifier: 1, target, clientX: 110, clientY: 308 });
      target.dispatchEvent(new TouchEvent("touchstart", { touches: [start], bubbles: true }));
      target.dispatchEvent(new TouchEvent("touchend", { changedTouches: [end], bubbles: true }));
    });
  } else {
    await carousel.focus();
    await page.keyboard.press("ArrowRight");
  }
  await expect(page.getByRole("button", { name: /Night Shift/, pressed: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous clip" }).click();
  await expect(page.getByRole("button", { name: /The Blue Hour/, pressed: true })).toBeVisible();
});

test("expanded catalog can be filtered and plays a newly published clip", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Browse all clips" }).click();
  await expect(page.getByText("12 of 102 matching clips")).toBeVisible();
  await page.getByRole("button", { name: "Show more clips" }).click();
  await expect(page.getByText("24 of 102 matching clips")).toBeVisible();
  await page.getByRole("combobox", { name: "Genre", exact: true }).selectOption("Travel");
  await page.getByRole("searchbox", { name: "Search clips" }).fill("oasis road");
  await expect(page.getByText("1 of 1 matching clip")).toBeVisible();
  await page.getByRole("link", { name: /Oasis Road/ }).click();
  await page.getByRole("button", { name: "Play Oasis Road" }).click();
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThan(1);
});

test("fresh test link restores the cold-start order and still accepts feedback", async ({ page }) => {
  await page.goto("/feed/");
  const refresh = page.getByRole("button", { name: /Refresh for You/ });
  await expect(refresh).toBeEnabled();
  const ranked = page.getByRole("region", { name: "Ranked clips" });
  const titles = () => ranked.locator(".lineup-copy strong").allTextContents();
  const baseline = await titles();
  expect(baseline).toHaveLength(12);

  async function giveFeedback() {
    await page.getByRole("button", { name: "♡ Like", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await refresh.click();
    await expect(page.getByRole("status").filter({ hasText: /Feed refreshed.*positions changed/ })).toBeVisible();
  }

  await giveFeedback();
  const personalized = await titles();
  expect(personalized).not.toEqual(baseline);
  await page.getByLabel("Freeze candidate pool").check();
  await page.getByLabel("Exploration", { exact: true }).press("End");

  await page.goto("/test/");
  await expect(page).toHaveURL(/\/feed\/$/);
  await expect(refresh).toBeEnabled();
  await expect(page.getByLabel("Freeze candidate pool")).not.toBeChecked();
  await expect(page.locator('output[for="feed-exploration"]')).toHaveText("25%");
  await expect(page.getByRole("button", { name: "♡ Like", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  expect(await titles()).toEqual(baseline);

  await giveFeedback();
  expect(await titles()).toEqual(personalized);
  await page.reload();
  await expect(refresh).toBeEnabled();
  expect(await titles()).toEqual(personalized);
});
