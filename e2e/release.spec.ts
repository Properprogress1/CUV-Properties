import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const admin = process.env.PLAYWRIGHT_ADMIN_URL || "http://localhost:3002";
const api = process.env.PLAYWRIGHT_API_URL || "http://localhost:3001";

test("mobile storefront, editorial publishing and protected exports", async ({
  page,
  browser,
  request,
}) => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error(
      "Seed the disposable release-test admin and set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD",
    );

  const homeResponse = await page.goto("/");
  expect(homeResponse?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(homeResponse?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Browse by category" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("link", { name: "Properties", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Open filters" }).click();
  const filters = page.getByRole("dialog");
  await filters.getByLabel("Minimum bedrooms").fill("4");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/bedrooms=4/);
  await page
    .getByRole("link", { name: /Courtyard residence in Lekki/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Courtyard residence in Lekki" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enlarge image" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const editor = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  try {
    await editor.goto(admin);
    await editor.getByLabel("Email").fill(email);
    await editor.getByLabel("Password").fill(password);
    await editor.getByRole("button", { name: "Sign in" }).click();
    await expect(
      editor.getByRole("heading", { name: "Overview" }),
    ).toBeVisible();
    await expect(
      editor.getByText("Total properties", { exact: true }),
    ).toBeVisible();
    await editor.getByLabel("Account menu").click();
    await expect(
      editor.getByRole("button", { name: "Sign out" }),
    ).toBeVisible();
    await editor.keyboard.press("Escape");
    await editor.getByRole("button", { name: "Open staff navigation" }).click();
    await editor
      .getByRole("button", { name: "Content Management", exact: true })
      .click();
    await editor.getByRole("button", { name: "New content" }).click();
    const draftForm = editor.locator("form").filter({
      has: editor.getByRole("button", { name: "Create draft" }),
    });
    const slugField = draftForm.getByLabel("URL slug");
    const titleField = draftForm.getByLabel("Title", { exact: true });
    const kindField = draftForm.getByLabel("Content type");
    const buttonPath = draftForm.getByLabel("Button path");
    await expect(slugField).toHaveValue("");
    await expect(titleField).toHaveValue("");
    await expect(editor.locator("#workspace").getByRole("alert")).toHaveCount(
      0,
    );
    await draftForm.getByRole("button", { name: "Create draft" }).click();
    await expect(slugField).toBeFocused();

    await titleField.fill("Discard this draft");
    await buttonPath.fill("https://external.example");
    await kindField.selectOption("ABOUT");
    await expect(slugField).toHaveValue("about");
    await expect(titleField).toHaveValue("");
    await expect(buttonPath).toHaveValue("");
    await kindField.selectOption("FAQ");
    await expect(slugField).toHaveValue("");
    await expect(slugField).toBeEditable();

    const invalidSlug = "invalid-" + randomUUID().slice(0, 8);
    await slugField.fill(invalidSlug);
    await titleField.fill("Invalid draft");
    await draftForm.getByLabel("Body (plain text)").fill("Draft body.");
    await draftForm.getByLabel("Button label").fill("External link");
    await buttonPath.fill("//external.example");
    await draftForm.getByRole("button", { name: "Create draft" }).click();
    await expect(editor.locator("#workspace").getByRole("alert")).toContainText(
      "Use a site-relative path",
    );
    await editor.getByRole("button", { name: "New content" }).click();
    await expect(kindField).toHaveValue("BLOG");
    await expect(titleField).toHaveValue("");
    await expect(buttonPath).toHaveValue("");
    await expect(editor.locator("#workspace").getByRole("alert")).toHaveCount(
      0,
    );

    const slug = "release-" + randomUUID().slice(0, 8);
    const title = "Release verification " + slug;
    await editor.getByLabel("URL slug").fill(slug);
    await editor.getByLabel("Title", { exact: true }).fill(title);
    await editor
      .getByLabel("Body (plain text)")
      .fill("Published body. <script>Rendered as text.</script>");
    await editor.getByLabel("Search title").fill("Editorial metadata " + slug);
    await editor.getByLabel("Button path").fill("   ");
    await editor.getByRole("button", { name: "Create draft" }).click();
    await expect(editor.getByRole("status")).toHaveText("Draft created.");
    expect((await request.get(api + "/api/v1/content/" + slug)).status()).toBe(
      404,
    );
    editor.once("dialog", (dialog) => dialog.accept());
    await editor.getByRole("button", { name: "Publish saved draft" }).click();
    await expect(editor.getByRole("status")).toHaveText("Content published.");
    await page.goto("/pages/" + slug);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      page.getByText("Published body. <script>Rendered as text.</script>", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page).toHaveTitle(
      "Editorial metadata " + slug + " | CUV Marketplace",
    );
    await editor.getByLabel("Body (plain text)").fill("A private revision.");
    await editor.getByLabel("Button label").fill("Browse listings");
    await editor.getByLabel("Button path").fill("/browse");
    await editor.getByRole("button", { name: "Save draft" }).click();
    await expect(editor.getByRole("status")).toHaveText("Draft saved.");
    await page.reload();
    await expect(
      page.getByText("Published body. <script>Rendered as text.</script>", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("A private revision.")).toHaveCount(0);

    expect(
      (await request.get(api + "/api/v1/admin/reports/summary.csv")).status(),
    ).toBe(401);
    await editor.getByRole("button", { name: "Open staff navigation" }).click();
    await editor.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(
      editor.getByRole("heading", { name: "Catalog activity" }),
    ).toBeVisible();
    const download = editor.waitForEvent("download");
    await editor.getByRole("link", { name: "Download summary CSV" }).click();
    expect((await download).suggestedFilename()).toBe(
      "marketplace-summary.csv",
    );
  } finally {
    await editor.close();
  }
});

test("a customer can save a listing and the next visitor sees no account data", async ({
  page,
  browser,
}) => {
  await page.goto("/account");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  const email = "release-" + randomUUID().slice(0, 12) + "@example.test";
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("disposable-release-account-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Favourites" })).toBeVisible({
    timeout: 20_000,
  });
  await page.goto("/listings/demo-property");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(
    page.getByText("Listing saved to your favourites.", { exact: true }),
  ).toBeVisible();
  await page.goto("/account");
  await expect(
    page.getByRole("link", { name: "Courtyard residence in Lekki" }),
  ).toBeVisible();
  const visitor = await browser.newPage();
  try {
    await visitor.goto(
      (process.env.PLAYWRIGHT_WEB_URL || "http://localhost:3000") + "/account",
    );
    await expect(
      visitor.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(visitor.getByText(email)).toHaveCount(0);
  } finally {
    await visitor.close();
  }
});
