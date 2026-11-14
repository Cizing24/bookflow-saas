import { afterEach, expect, it, vi } from "vitest";
import { assertDemoContact, syntheticContact } from "@/lib/demo";
import { emailProvider } from "@/modules/operations/notifications";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("public demo accepts only fixed synthetic contacts at the server boundary", () => {
  vi.stubEnv("DEPLOYMENT_ENV", "public-demo");
  expect(() => assertDemoContact(syntheticContact)).not.toThrow();
  for (const key of ["name", "email", "phone"] as const)
    expect(() =>
      assertDemoContact({ ...syntheticContact, [key]: "private-input" }),
    ).toThrow("合成聯絡資料");
  vi.stubEnv("DEPLOYMENT_ENV", "development");
  expect(() =>
    assertDemoContact({
      name: "Fixture",
      email: "fixture@example.test",
      phone: "123",
    }),
  ).not.toThrow();
});

it("public demo never calls an Email Gateway even if HTTP credentials are configured", async () => {
  vi.stubEnv("DEPLOYMENT_ENV", "public-demo");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("EMAIL_PROVIDER", "http");
  vi.stubEnv("EMAIL_HTTP_URL", "https://mail.example.test/send");
  vi.stubEnv("EMAIL_HTTP_TOKEN", "synthetic-test-only");
  vi.stubEnv("EMAIL_FROM", "fixture@example.test");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    emailProvider().send({
      id: "fixture",
      recipient: "visitor@example.test",
      subject: "Fixture",
      body: "Synthetic",
    }),
  ).rejects.toThrow("PUBLIC_DEMO_EMAIL_DISABLED");
  expect(fetcher).not.toHaveBeenCalled();
});
