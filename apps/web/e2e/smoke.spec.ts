import { expect, test } from "@playwright/test";

test("loads the production build under its Content Security Policy without errors", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "diagram-4-llm" }),
  ).toBeVisible();
  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"]'),
  ).toHaveCount(1);
  expect(problems).toEqual([]);
});

test("the Content Security Policy blocks connections it does not allow", async ({
  page,
}) => {
  await page.goto("/");

  // Plain HTTP to a remote host is not allowed. The request is blocked by
  // the browser before it reaches the network.
  const violatedDirective = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener(
          "securitypolicyviolation",
          (event) => {
            resolve(event.violatedDirective);
          },
          { once: true },
        );
        fetch("http://example.invalid/").catch(() => undefined);
      }),
  );

  expect(violatedDirective).toBe("connect-src");
});
