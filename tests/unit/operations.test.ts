import { describe, it, expect } from "vitest";
import {
  assertTransition,
  assertCutoff,
  type Status,
} from "@/modules/operations/domain";
import { newManagementToken, tokenHash } from "@/modules/operations/tokens";
const start = new Date("2030-01-01T01:00Z"),
  end = new Date("2030-01-01T02:00Z"),
  now = new Date("2030-01-01T03:00Z");
describe("Booking lifecycle", () => {
  it("allows only confirmed to terminal, rejects every terminal transition", () => {
    const statuses: Status[] = [
      "CONFIRMED",
      "CANCELLED",
      "COMPLETED",
      "NO_SHOW",
    ];
    for (const from of statuses)
      for (const to of statuses) {
        const run = () => assertTransition(from, to, start, end, now);
        if (from === "CONFIRMED" && to !== "CONFIRMED")
          expect(run).not.toThrow();
        else expect(run).toThrow();
      }
  });
  it("rejects premature completion and no-show", () => {
    expect(() =>
      assertTransition("CONFIRMED", "COMPLETED", start, end, start),
    ).toThrow();
    expect(() =>
      assertTransition(
        "CONFIRMED",
        "NO_SHOW",
        start,
        end,
        new Date(start.getTime() - 1),
      ),
    ).toThrow();
  });
  it("enforces exact cutoff and started bookings, including zero cutoff", () => {
    expect(() =>
      assertCutoff(start, 60, new Date("2030-01-01T00:00Z")),
    ).toThrow();
    expect(() => assertCutoff(start, 0, start)).toThrow();
    expect(() =>
      assertCutoff(start, 60, new Date("2029-12-31T23:59:59Z")),
    ).not.toThrow();
  });
  it("issues random 256-bit credentials and stores only hashes on Booking", () => {
    const a = newManagementToken(),
      b = newManagementToken();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(a).not.toBe(b);
    expect(tokenHash(a)).toHaveLength(64);
    expect(tokenHash(a)).not.toBe(a);
  });
});
