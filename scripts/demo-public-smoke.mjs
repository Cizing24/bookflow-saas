import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const origin = "https://bookflow-live-demo.vercel.app";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const checks = [];
const evidence = "public-demo-evidence";
await mkdir(evidence, { recursive: true });
const request = context.request;
const headers = { Origin: origin };
try {
  const health = await request.get(`${origin}/health`);
  assert.equal(
    health.status(),
    200,
    "Anonymous HTTPS health must query the real DB",
  );
  checks.push("anonymous HTTPS and live PostgreSQL health");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const response = await page.goto(`${origin}/b/flow-studio`);
    assert.equal(response.status(), 200);
    await expect(page.getByRole("note")).toContainText("合成 Demo");
    await expect(page.locator('input[name="email"]')).toHaveValue(
      "visitor@example.test",
    );
    await expect(page.locator('input[name="email"]')).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(
      page
        .getByRole("button", { name: /^\d{2}:\d{2} [+-]\d{2}:\d{2}$/ })
        .first(),
    ).toBeVisible();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Horizontal overflow at ${width}px`,
    );
    await page.screenshot({
      path: `${evidence}/booking-${width}.png`,
      fullPage: true,
    });
  }
  checks.push(
    "real UI and synthetic-only fields at desktop/tablet/390/320px, no horizontal overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: /^\d{2}:\d{2} [+-]\d{2}:\d{2}$/ })
    .first()
    .click();
  const createdResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/public/flow-studio/bookings") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "確認預約", exact: true }).click();
  const createdHttp = await createdResponse;
  assert.equal(createdHttp.status(), 200);
  const created = await createdHttp.json();
  assert.equal(created.status, "CONFIRMED");
  assert.equal(created.managementToken.length, 43);
  await expect(page.getByRole("heading", { name: "預約成功！" })).toBeVisible();
  const detailHttp = await request.post(`${origin}/api/manage`, {
    headers,
    data: { token: created.managementToken, mode: "detail" },
  });
  assert.equal(detailHttp.status(), 200);
  const detail = await detailHttp.json();
  assert.equal(detail.id, created.id);
  checks.push("browser booking write and private-token readback");
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(created.startAt));
  const payload = {
    serviceId: detail.serviceId,
    staffId: detail.staffId,
    startAt: created.startAt,
    name: "合成訪客",
    email: "visitor@example.test",
    phone: "0000000000",
    idempotencyKey: randomUUID(),
  };
  const conflict = await request.post(
    `${origin}/api/public/flow-studio/bookings`,
    { headers, data: payload },
  );
  assert.equal(conflict.status(), 409);
  const privateInput = await request.post(
    `${origin}/api/public/flow-studio/bookings`,
    {
      headers,
      data: {
        ...payload,
        name: "Rejected fixture",
        email: "fixture@example.invalid",
      },
    },
  );
  assert.equal(privateInput.status(), 400);
  const wrongOrigin = await request.post(
    `${origin}/api/public/flow-studio/bookings`,
    { headers: { Origin: "https://other.example.test" }, data: payload },
  );
  assert.equal(wrongOrigin.status(), 403);
  const unauthorized = await request.get(`${origin}/api/tenants`);
  assert.equal(unauthorized.status(), 401);
  const signup = await request.post(`${origin}/api/auth/sign-up/email`, {
    headers,
    data: {},
  });
  assert.equal(signup.status(), 403);
  const invalidToken = await request.post(`${origin}/api/manage`, {
    headers,
    data: { token: randomBytes(32).toString("base64url"), mode: "detail" },
  });
  assert.equal(invalidToken.status(), 404);
  checks.push(
    "occupied-slot conflict, non-synthetic contact rejection, Origin, signup and unauthorized/token guards",
  );
  const slotResponse = await request.get(
    `${origin}/api/public/flow-studio/slots?${new URLSearchParams({ serviceId: detail.serviceId, staffId: detail.staffId, date })}`,
  );
  assert.equal(slotResponse.status(), 200);
  const next = (await slotResponse.json()).slots.find(
    (value) => value !== created.startAt,
  );
  assert(next, "Synthetic fixture needs an alternative available slot");
  const moved = await request.post(`${origin}/api/manage`, {
    headers,
    data: {
      token: created.managementToken,
      action: "RESCHEDULE",
      revision: detail.revision,
      serviceId: detail.serviceId,
      staffId: detail.staffId,
      startAt: next,
    },
  });
  assert.equal(moved.status(), 200);
  const revision = (await moved.json()).revision;
  const cancelled = await request.post(`${origin}/api/manage`, {
    headers,
    data: { token: created.managementToken, action: "CANCELLED", revision },
  });
  assert.equal(cancelled.status(), 200);
  const finalRead = await request.post(`${origin}/api/manage`, {
    headers,
    data: { token: created.managementToken, mode: "detail" },
  });
  assert.equal(finalRead.status(), 200);
  assert.equal((await finalRead.json()).status, "CANCELLED");
  checks.push("reschedule, cancellation and persistent final-state readback");
  for (const path of ["/.env", "/.env.demo", "/debug"])
    assert.equal((await request.get(`${origin}${path}`)).status(), 404);
  checks.push("no public environment files or debug path");
  await writeFile(
    `${evidence}/results.json`,
    JSON.stringify(
      {
        origin,
        timestamp: new Date().toISOString(),
        source:
          "GitHub-hosted anonymous Chromium; no GitHub/browser authentication or protection bypass",
        checks,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: ${checks.length} public demo check groups. No tokens, customer payloads or credentials logged.`,
  );
} finally {
  await browser.close();
}
