import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { db } from "../../src/lib/db";
import { assertLocalDatabase } from "../database-safety";
assertLocalDatabase();
test.use({ actionTimeout: 15000 });
const origin = "http://localhost:3000";
let tenantId = "";
const userIds: string[] = [];
async function post(request: APIRequestContext, path: string, data: unknown) {
  return request.post(path, { headers: { Origin: origin }, data });
}
async function signup(request: APIRequestContext, key: string) {
  for (let i = 0; i < 5; i++) {
    const r = await post(request, "/api/auth/sign-up/email", {
      email: key + "@example.com",
      name: "Synthetic operator",
      password: "BookFlow-operations-2026!",
    });
    if (r.status() === 429) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          (Number(r.headers()["x-retry-after"] ?? 10) + 1) * 1000,
        ),
      );
      continue;
    }
    expect(r.ok(), await r.text()).toBe(true);
    const u = (await r.json()).user;
    userIds.push(u.id);
    return u.id as string;
  }
  throw new Error("Auth rate limit persisted");
}
test.afterEach(async () => {
  if (tenantId) {
    await db.tenant.delete({ where: { id: tenantId } });
    tenantId = "";
  }
  await db.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
});
test.afterAll(async () => {
  await db.$disconnect();
});
test("營運行事曆、顧客、通知、角色範圍與顧客自助改期取消", async ({
  page,
  request,
  playwright,
}, info) => {
  expect((await post(request, "/api/manage", null)).status()).toBe(400);
  const key = "ops-browser-" + info.project.name + "-" + randomUUID();
  const ownerId = await signup(page.request, key);
  const staffContext = await playwright.request.newContext({ baseURL: origin });
  try {
    const staffUser = await signup(staffContext, key + "-staff");
    const date = DateTime.now()
      .setZone("Asia/Taipei")
      .plus({ days: 3 })
      .toISODate()!;
    const at = (hour: number) =>
      DateTime.fromISO(date + `T${hour}:00`, { zone: "Asia/Taipei" })
        .toUTC()
        .toISO()!;
    const t = await db.tenant.create({
      data: {
        name: "營運測試店",
        slug: key,
        cancelCutoffMinutes: 60,
        rescheduleCutoffMinutes: 60,
        memberships: { create: { userId: ownerId, role: "OWNER" } },
        staff: { create: [{ name: "小青" }, { name: "小藍" }] },
        services: {
          create: { name: "營運服務", price: 1200, durationMinutes: 60 },
        },
        hours: {
          create: Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            openMinute: 540,
            closeMinute: 1080,
          })),
        },
      },
      include: { staff: true, services: true },
    });
    tenantId = t.id;
    const serviceId = t.services[0].id,
      staffId = t.staff[0].id;
    await db.staffService.createMany({
      data: t.staff.map((s) => ({ tenantId, staffId: s.id, serviceId })),
    });
    await db.membership.create({
      data: { tenantId, userId: staffUser, role: "STAFF", staffId },
    });
    const r = await post(request, `/api/public/${key}/bookings`, {
      serviceId,
      staffId,
      startAt: at(10),
      name: "合成顧客",
      email: "synthetic@example.com",
      phone: "0912345678",
      idempotencyKey: randomUUID(),
    });
    expect(r.ok(), await r.text()).toBe(true);
    const b = await r.json();
    expect(
      (
        await request.get(`/api/tenants/${tenantId}/calendar?from=${date}`)
      ).status(),
    ).toBe(401);
    expect(
      (await staffContext.get(`/api/tenants/${tenantId}/customers`)).status(),
    ).toBe(403);
    expect(
      (
        await staffContext.get(`/api/tenants/${tenantId}/notifications`)
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(staffContext, `/api/tenants/${tenantId}/settings`, {
          cancelCutoffMinutes: 0,
          rescheduleCutoffMinutes: 0,
        })
      ).status(),
    ).toBe(403);
    const staffCalendar = await (
      await staffContext.get(`/api/tenants/${tenantId}/calendar?from=${date}`)
    ).json();
    expect(staffCalendar.staff).toHaveLength(1);
    expect(
      (
        await staffContext.get(
          `/api/tenants/${tenantId}/calendar?from=${date}&staffId=${t.staff[1].id}`,
        )
      ).status(),
    ).toBe(403);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "掌握店家的每一天" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "營運數據" })).toBeVisible();
    await page.getByRole("button", { name: "專業行事曆", exact: true }).click();
    await page.getByLabel("行事曆日期", { exact: true }).fill(date);
    await page.getByLabel("檢視", { exact: true }).selectOption("week");
    await page.getByLabel("篩選員工", { exact: true }).selectOption(staffId);
    const event = page.getByRole("button", { name: /10:00.*合成顧客/ });
    await expect(event).toBeVisible();
    await page.screenshot({
      path: info.outputPath("calendar.png"),
      fullPage: true,
    });
    await event.click();
    await expect(
      page.getByRole("heading", { name: "預約詳情", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "查詢改期時段", exact: true })
      .click();
    await page.getByLabel("改期時段", { exact: true }).selectOption(at(11));
    await page.getByRole("button", { name: "確認改期", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /11:00.*合成顧客/ }),
    ).toBeVisible();
    await page.getByText("異動紀錄（最近 100 筆）", { exact: true }).click();
    await expect(page.getByText(/USER:.*RESCHEDULE/)).toBeVisible();
    await page.getByRole("button", { name: "顧客管理", exact: true }).click();
    await page.getByLabel("搜尋顧客", { exact: true }).fill("synthetic");
    await page.getByRole("button", { name: "搜尋", exact: true }).click();
    await page.getByRole("button", { name: "查看顧客", exact: true }).click();
    await expect(
      page.getByText("歷史預約：1 次", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "店家與成員", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "通知與 Email 預覽", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/預約成立 · PENDING/)).toBeVisible();
    const stats = await (
      await page.request.get(
        `/api/tenants/${tenantId}/statistics?from=${date}&days=1`,
      )
    ).json();
    expect(stats.total).toBe(1);
    await page.goto("/manage#" + b.managementToken);
    await expect(
      page.getByRole("heading", { name: "預約詳情", exact: true }),
    ).toBeVisible();
    expect(page.url()).not.toContain(b.managementToken);
    await expect(page.getByText("狀態：已確認", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "查詢改期時段", exact: true })
      .click();
    await page.getByLabel("改期時段", { exact: true }).selectOption(at(12));
    await page.getByRole("button", { name: "確認改期", exact: true }).click();
    await expect
      .poll(async () =>
        (
          await db.booking.findUniqueOrThrow({ where: { id: b.id } })
        ).startAt.toISOString(),
      )
      .toBe(new Date(at(12)).toISOString());
    await page.getByRole("button", { name: "取消此預約", exact: true }).click();
    await expect(page.getByText("狀態：已取消", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("狀態：已取消", { exact: true })).toBeVisible();
    expect(await db.bookingEvent.count({ where: { bookingId: b.id } })).toBe(4);
    expect(
      (
        await post(request, "/api/manage", {
          token: randomUUID().replaceAll("-", "") + "xxxxxxxxxxx",
          mode: "detail",
        })
      ).status(),
    ).toBe(404);
  } finally {
    await staffContext.dispose();
  }
});
