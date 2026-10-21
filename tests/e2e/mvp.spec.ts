import { test, expect, type APIRequestContext } from "@playwright/test";
import { DateTime } from "luxon";
import { db } from "../../src/lib/db";
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
  await page.getByRole("button", { name: "登入", exact: true }).click();
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
  await page.getByRole("button", { name: "09:00", exact: true }).click();
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
  await page.getByRole("button", { name: "建立帳號", exact: true }).click();
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
