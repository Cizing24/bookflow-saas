import { afterEach, describe, expect, it, vi } from "vitest";
import { emailProvider } from "@/modules/operations/notifications";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const message = {
  id: "synthetic-job",
  recipient: "fixture@example.com",
  subject: "Fixture",
  body: "Synthetic only",
};
describe("Email provider contract", () => {
  it("sends exactly the gateway contract and a stable deduplication key", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "http");
    vi.stubEnv("EMAIL_HTTP_URL", "https://mail.example/send");
    vi.stubEnv("EMAIL_HTTP_TOKEN", "synthetic-test-credential");
    vi.stubEnv("EMAIL_FROM", "sender@example.com");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetcher);
    expect(
      await emailProvider().send({
        ...message,
        internalSecret: "must-not-leave",
      } as typeof message),
    ).toBe("SENT");
    const args = fetcher.mock.calls[0];
    expect(args[0]).toBe("https://mail.example/send");
    expect(args[1].headers["Idempotency-Key"]).toBe(message.id);
    expect(JSON.parse(args[1].body)).toEqual({
      ...message,
      from: "sender@example.com",
    });
  });
  it("rejects provider errors and refuses preview in production", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "preview");
    vi.stubEnv("NODE_ENV", "production");
    await expect(emailProvider().send(message)).rejects.toThrow();
    vi.stubEnv("NODE_ENV", "development");
    expect(await emailProvider().send(message)).toBe("PREVIEWED");
    vi.stubEnv("EMAIL_PROVIDER", "http");
    vi.stubEnv("EMAIL_HTTP_URL", "https://mail.example/send");
    vi.stubEnv("EMAIL_HTTP_TOKEN", "synthetic-test-credential");
    vi.stubEnv("EMAIL_FROM", "sender@example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    await expect(emailProvider().send(message)).rejects.toThrow(
      "EMAIL_PROVIDER_REJECTED",
    );
  });
});
