import { describe, it, expect } from "vitest";
import { mapWithConcurrency, chunk } from "./concurrency";

const tick = () => new Promise<void>((r) => setTimeout(r, 1));

describe("mapWithConcurrency", () => {
  it("never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrency(items, 4, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
      return n;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("preserves input order even when items finish out of order", async () => {
    const items = [30, 1, 20, 2];
    const results = await mapWithConcurrency(items, 4, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual(items);
  });

  it("surfaces rejections as settled results instead of throwing", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });

    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1].status).toBe("rejected");
    expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
  });

  it("returns an empty array for no items without calling fn", async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 4, async () => {
      calls++;
      return 1;
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe("chunk", () => {
  it("splits into consecutive chunks and keeps the remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
