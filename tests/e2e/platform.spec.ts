import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { assertLocalDatabase } from "../database-safety";
assertLocalDatabase();
test("平台登入、Owner 隔離、啟停稽核、CSRF 與健康檢查", async ({
  page,
  request,
}, info) => {
  const key = "platform-browser-" + randomUUID();
  let userId = "",
    tenantId = "";
  try {
    expect((await request.get("/health")).status()).toBe(200);
    expect((await request.get("/api/platform")).status()).toBe(401);
    const invalidPatch = await request.patch("/api/tenants/missing/services", {
      headers: { Origin: "http://localhost:3000" },
      data: null,
    });
    expect(invalidPatch.status()).toBe(400);
    expect(invalidPatch.headers()["cache-control"]).toBe("no-store");
    await page.goto("/platform");
    await expect(page).toHaveURL("/login");
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await page.request.post("/api/auth/sign-up/email", {
        headers: { Origin: "http://localhost:3000" },
        data: {
          name: "Synthetic platform operator",
          email: key + "@example.com",
          password: "BookFlow-platform-2026!",
        },
      });
      if (r.status() === 429) {
        await page.waitForTimeout(
          (Number(
            r.headers()["x-retry-after"] ?? r.headers()["retry-after"] ?? 60,
          ) +
            1) *
            1000,
        );
        continue;
      }
      expect(r.ok(), await r.text()).toBe(true);
      userId = (await r.json()).user.id;
      break;
    }
    expect(userId).not.toBe("");
    const tenant = await db.tenant.create({
      data: {
        name: "平台驗收合成店家",
        slug: key,
        memberships: { create: { userId, role: "OWNER" } },
      },
    });
    tenantId = tenant.id;
    expect((await page.request.get("/api/platform")).status()).toBe(403);
    await page.goto("/platform");
    await expect(
      page.getByRole("heading", { name: "無平台管理權限" }),
    ).toBeVisible();
    await db.platformAdmin.create({ data: { userId } });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "平台管理", exact: true }),
    ).toBeVisible();
    const cookie = (await page.context().cookies()).find((c) =>
      c.name.includes("session_token"),
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    const patch = {
      tenantId,
      active: false,
      expectedActive: true,
      reason: "合成測試停用",
    };
    expect(
      (
        await page.request.patch("/api/platform", {
          headers: { Origin: "https://evil.example" },
          data: patch,
        })
      ).status(),
    ).toBe(403);
    await page.getByLabel("操作原因", { exact: false }).fill("合成測試停用");
    await page
      .getByRole("button", { name: "停用 平台驗收合成店家", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "啟用 平台驗收合成店家", exact: true }),
    ).toBeVisible();
    expect((await page.request.get(`/api/tenants/${tenantId}`)).status()).toBe(
      403,
    );
    expect(
      (
        await request.get(
          `/api/public/${key}/dates?serviceId=missing&staffId=missing`,
        )
      ).status(),
    ).toBe(404);
    const publicPage = await page.context().newPage();
    try {
      await publicPage.goto(`/b/${key}`);
      await expect(
        publicPage.getByRole("heading", { name: "找不到此頁面" }),
      ).toBeVisible();
      await expect(
        publicPage.getByRole("button", { name: "確認預約", exact: true }),
      ).toHaveCount(0);
    } finally {
      await publicPage.close();
    }
    await page.screenshot({
      path: info.outputPath("platform.png"),
      fullPage: true,
    });
    await page.getByLabel("操作原因", { exact: false }).fill("合成測試恢復");
    await page
      .getByRole("button", { name: "啟用 平台驗收合成店家", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "停用 平台驗收合成店家", exact: true }),
    ).toBeVisible();
    expect((await page.request.get(`/api/tenants/${tenantId}`)).status()).toBe(
      200,
    );
    expect(
      await db.platformEvent.count({ where: { tenantId, actorId: userId } }),
    ).toBe(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await db.platformAdmin.delete({ where: { userId } });
    expect((await page.request.get("/api/platform")).status()).toBe(403);
  } finally {
    if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
    if (userId) {
      await db.platformEvent.deleteMany({ where: { actorId: userId } });
      await db.user.delete({ where: { id: userId } });
    }
  }
});
test.afterAll(async () => {
  await db.$disconnect();
});
