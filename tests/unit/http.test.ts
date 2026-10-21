import { expect, it, vi } from "vitest";
import { readJson, respond, sameOrigin } from "@/lib/http";
it("rejects missing or foreign Origin", () => {
  const before = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "https://booking.example.com";
  try {
    expect(() =>
      sameOrigin(new Request("https://booking.example.com")),
    ).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://booking.example.com", {
          headers: { Origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://booking.example.com", {
          headers: { Origin: "https://booking.example.com" },
        }),
      ),
    ).not.toThrow();
  } finally {
    process.env.BETTER_AUTH_URL = before;
  }
});
it("limits streamed JSON without trusting content-length", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(65536) }),
  });
  const result = await respond(() => readJson(request));
  expect(result.status).toBe(413);
  expect(result.headers.get("cache-control")).toBe("no-store");
});
it("rejects malformed JSON and wrong media type", async () => {
  expect(
    (
      await respond(() =>
        readJson(
          new Request("http://localhost", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
          }),
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await respond(() =>
        readJson(
          new Request("http://localhost", { method: "POST", body: "{}" }),
        ),
      )
    ).status,
  ).toBe(415);
});
it("redacts unexpected server errors and prevents caching", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const r = await respond(async () => {
      throw new Error("synthetic-sensitive-value");
    });
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("synthetic-sensitive-value");
    expect(JSON.stringify(spy.mock.calls)).not.toContain(
      "synthetic-sensitive-value",
    );
    expect(r.headers.get("cache-control")).toBe("no-store");
  } finally {
    spy.mockRestore();
  }
});
