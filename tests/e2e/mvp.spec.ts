import { assertLocalDatabase } from "../database-safety";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { DateTime } from "luxon";
import { db } from "../../src/lib/db";
assertLocalDatabase();
const createdTenants: string[] = [];
const createdUsers: string[] = [];
test.afterEach(async () => {
  for (const tenantId of createdTenants.splice(0)) {
    await db.booking.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  }
  for (const id of createdUsers.splice(0))
    await db.user.delete({ where: { id } });
});
test.afterAll(async () => {
  await db.$disconnect();
});
const origin = "http://localhost:3000";
async function signup(request: APIRequestContext, email: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await request.post("/api/auth/sign-up/email", {
      headers: { Origin: origin },
      data: { name: "測試店長", email, password: "BookFlow-test-2026!" },
    });
    if (r.status() === 429 && attempt < 3) {
      const seconds = Number(r.headers()["x-retry-after"] ?? 10);
      await new Promise((resolve) =>
        setTimeout(resolve, (Math.min(30, Math.max(1, seconds)) + 1) * 1000),
      );
      continue;
    }
    expect(r.ok(), await r.text()).toBeTruthy();
    const result = await r.json();
    createdUsers.push(result.user.id);
    return result.user as { id: string };
  }
  throw new Error("Signup failed after respecting rate-limit retries");
}
async function submitAuth(page: Page, name: string, endpoint: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const responsePromise = page.waitForResponse(
      (r) => r.url().endsWith(endpoint) && r.request().method() === "POST",
    );
    await page.getByRole("button", { name, exact: true }).click();
    const response = await responsePromise;
    if (response.status() !== 429) {
      expect(response.ok()).toBe(true);
      return;
    }
    const seconds = Number(response.headers()["x-retry-after"] ?? 10);
    await new Promise((resolve) =>
      setTimeout(resolve, (Math.min(30, Math.max(1, seconds)) + 1) * 1000),
    );
  }
  throw new Error(
    "UI authentication remained rate limited after respecting retries",
  );
}
async function post(request: APIRequestContext, path: string, data: unknown) {
  return request.post(path, { headers: { Origin: origin }, data });
}
test("Owner 管理、匿名預約、多租戶隔離與併發防衝突", async ({
  page,
  request,
  playwright,
}, testInfo) => {
  const key = Date.now() + "-" + testInfo.project.name;
  await signup(request, "owner-" + key + "@example.com");
  const t = await post(request, "/api/tenants", {
    name: "測試工作室",
    slug: "test-" + key,
    timezone: "Asia/Taipei",
  });
  expect(t.ok(), await t.text()).toBeTruthy();
  const tenant = await t.json();
  createdTenants.push(tenant.id);
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("owner-" + key + "@example.com");
  await page.getByLabel("密碼", { exact: true }).fill("BookFlow-test-2026!");
  await submitAuth(page, "登入", "/api/auth/sign-in/email");
  await expect(page).toHaveURL("/dashboard");
  await page.getByRole("button", { name: "服務項目", exact: true }).click();
  await page.getByLabel("服務名稱", { exact: true }).fill("舒壓服務");
  await page.getByLabel("價格（NT$）").fill("1500");
  await page.getByLabel("服務分鐘數").fill("60");
  await page.getByRole("button", { name: "儲存服務" }).click();
  await expect(
    page.getByRole("heading", { name: "舒壓服務上架中", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "編輯", exact: true }).click();
  await page.getByLabel("價格（NT$）").fill("1600");
  await page.getByRole("button", { name: "儲存服務" }).click();
  await expect(page.getByText("60 分鐘 · $1,600")).toBeVisible();
  await page.getByRole("button", { name: "服務人員", exact: true }).click();
  await page.getByLabel("人員姓名").fill("服務師小林");
  await page.getByRole("button", { name: "儲存人員" }).click();
  await expect(page.getByRole("heading", { name: "服務師小林" })).toBeVisible();
  const overview = await (
    await request.get("/api/tenants/" + tenant.id)
  ).json();
  const service = overview.services[0],
    staff = overview.staff[0];
  const date = DateTime.now().setZone("Asia/Taipei").plus({ days: 3 });
  const day = date.weekday % 7;
  const hour = await post(request, "/api/tenants/" + tenant.id + "/hours", [
    { weekday: day, openMinute: 540, closeMinute: 1080 },
  ]);
  expect(hour.ok()).toBeTruthy();
  await page.goto("/b/" + tenant.slug);
  await page.getByLabel("預約日期").fill(date.toISODate()!);
  await page.getByRole("button", { name: "09:00 +08:00", exact: true }).click();
  await page.screenshot({
    path: "test-results/public-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  await page.getByLabel("姓名", { exact: true }).fill("預約顧客");
  await page
    .getByLabel("Email", { exact: true })
    .fill("customer-" + key + "@example.com");
  await page.getByLabel("聯絡電話").fill("0912345678");
  await page.getByRole("button", { name: "確認預約", exact: true }).click();
  await expect(page.getByRole("heading", { name: "預約成功！" })).toBeVisible();
  await expect(page.getByText("費用：NT$ 1,600")).toBeVisible();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "預約列表", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "預約顧客", exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  expect((await anonymous.get("/api/tenants/" + tenant.id)).status()).toBe(401);
  const other = await playwright.request.newContext({ baseURL: origin });
  const otherUser = await signup(other, "other-" + key + "@example.com");
  const t2 = await post(other, "/api/tenants", {
    name: "另一間店",
    slug: "other-" + key,
    timezone: "Asia/Taipei",
  });
  expect(t2.ok(), await t2.text()).toBeTruthy();
  const tenant2 = await t2.json();
  createdTenants.push(tenant2.id);
  expect((await other.get("/api/tenants/" + tenant.id)).status()).toBe(403);
  expect(
    (
      await post(other, "/api/tenants/" + tenant.id + "/services", {
        name: "入侵",
        price: 0,
        durationMinutes: 30,
      })
    ).status(),
  ).toBe(403);
  const attack = await request.patch(
    "/api/tenants/" + tenant2.id + "/services",
    {
      headers: { Origin: origin },
      data: { id: service.id, name: "跨店修改", price: 0, durationMinutes: 30 },
    },
  );
  expect(attack.status()).toBe(403);
  const leaked = await anonymous.get(
    "/api/public/" +
      tenant2.slug +
      "/slots?" +
      new URLSearchParams({
        serviceId: service.id,
        staffId: staff.id,
        date: date.toISODate()!,
      }),
  );
  expect(leaked.status()).toBe(400);
  const slots = await (
    await anonymous.get(
      "/api/public/" +
        tenant.slug +
        "/slots?" +
        new URLSearchParams({
          serviceId: service.id,
          staffId: staff.id,
          date: date.toISODate()!,
        }),
    )
  ).json();
  const startAt = slots.slots[0];
  expect(startAt).toBeTruthy();
  const body = {
    serviceId: service.id,
    staffId: staff.id,
    startAt,
    name: "併發顧客",
    email: "race-" + key + "@example.com",
    phone: "0912345678",
    endAt: "2099-01-01T00:00:00Z",
  };
  const race = await Promise.all([
    post(anonymous, "/api/public/" + tenant.slug + "/bookings", body),
    post(anonymous, "/api/public/" + tenant.slug + "/bookings", body),
  ]);
  expect(race.map((r) => r.status()).sort()).toEqual([200, 409]);
  const confirmed = await race.find((r) => r.status() === 200)!.json();
  expect(Date.parse(confirmed.endAt) - Date.parse(confirmed.startAt)).toBe(
    60 * 60000,
  );
  const crossOrigin = await anonymous.post(
    "/api/public/" + tenant.slug + "/bookings",
    { headers: { Origin: "https://evil.example" }, data: body },
  );
  expect(crossOrigin.status()).toBe(403);
  const foreignService = await (
    await post(other, "/api/tenants/" + tenant2.id + "/services", {
      name: "Foreign",
      price: 500,
      durationMinutes: 30,
    })
  ).json();
  expect(
    (
      await request.patch("/api/tenants/" + tenant.id + "/services", {
        headers: { Origin: origin },
        data: {
          id: foreignService.id,
          name: "Forbidden",
          price: 1,
          durationMinutes: 30,
        },
      })
    ).status(),
  ).toBe(404);
  await db.membership.create({
    data: { userId: otherUser.id, tenantId: tenant.id, role: "STAFF" },
  });
  expect((await other.get("/api/tenants/" + tenant.id)).status()).toBe(200);
  expect(
    (
      await post(other, "/api/tenants/" + tenant.id + "/services", {
        name: "Staff cannot write",
        price: 0,
        durationMinutes: 30,
      })
    ).status(),
  ).toBe(403);
  for (const resource of ["schedule", "policy", "cancel"]) {
    expect(
      (
        await post(other, "/api/tenants/" + tenant.id + "/" + resource, {})
      ).status(),
    ).toBe(403);
  }
  await db.membership.update({
    where: { tenantId_userId: { tenantId: tenant.id, userId: otherUser.id } },
    data: { role: "ADMIN" },
  });
  expect(
    (
      await post(other, "/api/tenants/" + tenant.id + "/services", {
        name: "Admin can write",
        price: 0,
        durationMinutes: 30,
      })
    ).status(),
  ).toBe(200);
  const later = await (
    await anonymous.get(
      "/api/public/" +
        tenant.slug +
        "/slots?" +
        new URLSearchParams({
          serviceId: service.id,
          staffId: staff.id,
          date: date.toISODate()!,
        }),
    )
  ).json();
  const repeated = await post(
    anonymous,
    "/api/public/" + tenant.slug + "/bookings",
    {
      ...body,
      startAt: later.slots[0],
      email: "customer-" + key + "@example.com",
      name: "另一位同 Email 顧客",
    },
  );
  expect(repeated.status()).toBe(200);
  const updated = await (await request.get("/api/tenants/" + tenant.id)).json();
  expect(
    updated.bookings.find(
      (b: { customer: { name: string } }) => b.customer.name === "預約顧客",
    ),
  ).toBeTruthy();
  const offGrid = await post(
    anonymous,
    "/api/public/" + tenant.slug + "/bookings",
    {
      ...body,
      startAt: DateTime.fromISO(later.slots[0])
        .plus({ minutes: 5 })
        .toUTC()
        .toISO(),
    },
  );
  expect(offGrid.status()).toBe(409);
  const disabled = await request.patch(
    "/api/tenants/" + tenant.id + "/services",
    {
      headers: { Origin: origin },
      data: {
        id: service.id,
        name: service.name,
        price: service.price,
        durationMinutes: service.durationMinutes,
        active: false,
      },
    },
  );
  expect(disabled.status()).toBe(200);
  expect(
    (
      await post(anonymous, "/api/public/" + tenant.slug + "/bookings", body)
    ).status(),
  ).toBe(400);
  await page.route(
    "**/api/auth/sign-out",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Synthetic sign-out failure" }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "登出失敗" }),
  ).toContainText("登出失敗");
  await expect(page).toHaveURL("/dashboard");
  expect((await page.request.get("/api/tenants/" + tenant.id)).status()).toBe(
    200,
  );
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await expect(page).toHaveURL("/login");
  expect((await page.request.get("/api/tenants/" + tenant.id)).status()).toBe(
    401,
  );
  await other.dispose();
  await anonymous.dispose();
});

test("透過畫面註冊與建立店家", async ({ page }, testInfo) => {
  const key = Date.now() + "-" + testInfo.project.name;
  const email = "onboarding-" + key + "@example.com";
  await page.goto("/register");
  await page.getByLabel("姓名", { exact: true }).fill("新店長");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("密碼", { exact: true }).fill("BookFlow-test-2026!");
  await submitAuth(page, "建立帳號", "/api/auth/sign-up/email");
  await expect(page).toHaveURL("/dashboard");
  const session = await (
    await page.request.get("/api/auth/get-session")
  ).json();
  createdUsers.push(session.user.id);
  await expect(
    page.getByRole("heading", { name: "建立你的店家" }),
  ).toBeVisible();
  await page.getByLabel("店家名稱", { exact: true }).fill("畫面建立的店家");
  await page
    .getByLabel("專屬網址 Slug", { exact: false })
    .fill("onboarding-" + key);
  await page.getByLabel("店家時區").selectOption("Asia/Tokyo");
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/tenants") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "建立店家", exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const tenant = await response.json();
  createdTenants.push(tenant.id);
  expect(tenant.timezone).toBe("Asia/Tokyo");
  await expect(
    page.getByRole("heading", { name: "掌握店家的每一天" }),
  ).toBeVisible();
  const info = await (
    await page.request.get("/api/tenants/" + tenant.id)
  ).json();
  expect(info.role).toBe("OWNER");
  expect(info.services).toEqual([]);
});

test("Phase 2 排班管理、真實時段、衝突、取消與 20 請求搶訂", async ({
  page,
  request,
}, testInfo) => {
  const key = Date.now() + "-schedule-" + testInfo.project.name;
  const email = "schedule-" + key + "@example.com";
  await signup(request, email);
  const tenant = await (
    await post(request, "/api/tenants", {
      name: "排班測試店",
      slug: "schedule-" + key,
      timezone: "Asia/Taipei",
    })
  ).json();
  createdTenants.push(tenant.id);
  const base = "/api/tenants/" + tenant.id + "/";
  const service = await (
    await post(request, base + "services", {
      name: "排班服務",
      price: 900,
      durationMinutes: 60,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
    })
  ).json();
  const extra = await (
    await post(request, base + "services", {
      name: "不提供服務",
      price: 300,
      durationMinutes: 30,
    })
  ).json();
  const staff = await (
    await post(request, base + "staff", { name: "排班員工" })
  ).json();
  const day = DateTime.now().setZone("Asia/Taipei").plus({ days: 3 });
  const weekday = day.weekday % 7;
  const closedDate = day.plus({ days: 1 }).toISODate()!;
  expect(
    (
      await post(
        request,
        base + "hours",
        [weekday, (weekday + 1) % 7].map((weekday) => ({
          weekday,
          openMinute: 540,
          closeMinute: 1080,
        })),
      )
    ).ok(),
  ).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("密碼", { exact: true }).fill("BookFlow-test-2026!");
  await submitAuth(page, "登入", "/api/auth/sign-in/email");
  await expect(page).toHaveURL("/dashboard");
  await page.getByRole("button", { name: "員工排班", exact: true }).click();
  await page.getByLabel("最低提前分鐘").fill("60");
  await page.getByLabel("最遠預約天數").fill("7");
  await page.getByLabel("時段間隔分鐘").fill("15");
  await page.getByRole("button", { name: "儲存預約政策" }).click();
  await expect(page.getByRole("status")).toContainText("儲存");
  await page.getByLabel("使用員工專屬工作時間").check();
  await page.getByLabel("不提供服務", { exact: true }).uncheck();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "新增班段", exact: true }).click();
    await page
      .getByLabel("星期", { exact: true })
      .nth(i)
      .selectOption(String(i === 3 ? (weekday + 1) % 7 : weekday));
    await page
      .getByLabel("區間類型")
      .nth(i)
      .selectOption(i === 2 ? "BREAK" : "WORK");
    await page
      .getByLabel("開始時間", { exact: true })
      .nth(i)
      .fill(["09:00", "13:00", "15:00", "09:00"][i]);
    await page
      .getByLabel("結束時間", { exact: true })
      .nth(i)
      .fill(["12:00", "18:00", "15:30", "18:00"][i]);
  }
  await page.getByRole("button", { name: "新增停班日期" }).click();
  await page.getByLabel("停班日期", { exact: true }).fill(closedDate);
  await page.getByLabel("停班原因").fill("合成休假");
  await page.getByRole("button", { name: "儲存 排班員工 排班" }).click();
  await expect(page.getByRole("status")).toContainText("儲存");
  const state = await (await request.get("/api/tenants/" + tenant.id)).json();
  expect(state.staff[0].schedule).toHaveLength(4);
  expect(state.staff[0].absences[0].date).toBe(closedDate);
  expect(
    state.staff[0].services.map((s: { serviceId: string }) => s.serviceId),
  ).toEqual([service.id]);
  const publicBase = "/api/public/" + tenant.slug;
  const query = (date: string) =>
    publicBase +
    "/slots?" +
    new URLSearchParams({ date, serviceId: service.id, staffId: staff.id });
  const slots = (await (await request.get(query(day.toISODate()!))).json())
    .slots as string[];
  const local = slots.map((s) =>
    DateTime.fromISO(s).setZone("Asia/Taipei").toFormat("HH:mm"),
  );
  expect(local).toContain("09:15");
  expect(local).not.toContain("11:00");
  expect(local).not.toContain("14:15");
  expect((await (await request.get(query(closedDate))).json()).slots).toEqual(
    [],
  );
  expect(
    (
      await request.get(
        publicBase +
          "/slots?" +
          new URLSearchParams({
            date: day.toISODate()!,
            serviceId: extra.id,
            staffId: staff.id,
          }),
      )
    ).status(),
  ).toBe(400);
  await page.goto("/b/" + tenant.slug);
  await page.getByLabel("服務項目", { exact: true }).selectOption(service.id);
  await page.getByLabel("預約日期").fill(day.toISODate()!);
  await page.getByRole("button", { name: "09:15 +08:00", exact: true }).click();
  const body = {
    serviceId: service.id,
    staffId: staff.id,
    startAt: slots[0],
    name: "搶訂顧客",
    email: "synthetic@example.com",
    phone: "0912345678",
  };
  expect((await post(request, publicBase + "/bookings", body)).status()).toBe(
    200,
  );
  await page.getByLabel("姓名", { exact: true }).fill("畫面預約顧客");
  await page
    .getByLabel("Email", { exact: true })
    .fill("ui-fixture@example.com");
  await page.getByLabel("聯絡電話").fill("0912345678");
  await page.getByRole("button", { name: "確認預約", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "此時段已無法預約" }),
  ).toContainText("此時段已無法預約");
  await page.getByRole("button", { name: "重新查詢時段" }).click();
  const nextSlots = (await (await request.get(query(day.toISODate()!))).json())
    .slots as string[];
  const next = nextSlots[0];
  const label = DateTime.fromISO(next)
    .setZone("Asia/Taipei")
    .toFormat("HH:mm ZZ");
  await page.getByRole("button", { name: label, exact: true }).click();
  // Commit through the real server, then drop its HTTP response to simulate a lost network reply.
  let lostBookingId = "";
  await page.route(
    "**" + publicBase + "/bookings",
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      lostBookingId = (await response.json()).id;
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "確認預約", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "無法連線" }),
  ).toContainText("無法連線");
  await page.getByRole("button", { name: "確認預約", exact: true }).click();
  await expect(page.getByRole("heading", { name: "預約成功！" })).toBeVisible();
  await expect(page.getByText("預約編號：" + lostBookingId)).toBeVisible();
  expect(
    await db.booking.count({
      where: {
        tenantId: tenant.id,
        staffId: staff.id,
        startAt: new Date(next),
        status: "CONFIRMED",
      },
    }),
  ).toBe(1);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "預約列表", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "畫面預約顧客" });
  await row.getByRole("button", { name: "取消預約" }).click();
  await expect(row).toContainText("已取消");
  expect(
    (await (await request.get(query(day.toISODate()!))).json()).slots,
  ).toContain(next);
  const race = await Promise.all(
    Array.from({ length: 20 }, () =>
      post(request, publicBase + "/bookings", { ...body, startAt: next }),
    ),
  );
  expect(race.filter((r) => r.status() === 200)).toHaveLength(1);
  expect(race.filter((r) => r.status() === 409)).toHaveLength(19);
  console.info(`HTTP race (${testInfo.project.name}): 1 success, 19 conflicts`);
  const remaining = (await (await request.get(query(day.toISODate()!))).json())
    .slots[0];
  const retried = {
    ...body,
    startAt: remaining,
    idempotencyKey: "e2e-retry-" + key,
  };
  const replies = await Promise.all(
    Array.from({ length: 3 }, () =>
      post(request, publicBase + "/bookings", retried),
    ),
  );
  expect(replies.every((r) => r.status() === 200)).toBe(true);
  const receipts = await Promise.all(replies.map((r) => r.json()));
  expect(new Set(receipts.map((r) => r.id)).size).toBe(1);
});
