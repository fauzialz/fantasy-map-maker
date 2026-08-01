import { describe, expect, it } from "vitest";
import { MAX_PIXELS, MAX_SIDE, planExport } from "./image";

const LANDSCAPE = { w: 4000, h: 3000 };

describe("planExport", () => {
  it("passes a scale straight through when it fits", () => {
    expect(planExport(LANDSCAPE, 2)).toEqual({ scale: 2, w: 8000, h: 6000, capped: false });
  });

  it("caps on the pixel budget and says so", () => {
    const plan = planExport(LANDSCAPE, 4);
    expect(plan.capped).toBe(true);
    expect(plan.scale).toBeLessThan(4);
    expect(plan.w * plan.h).toBeLessThanOrEqual(MAX_PIXELS);
  });

  it("caps on the longest side when that binds first", () => {
    // Long and thin: 16000x100 is only 1.6 MP, so only the side limit can stop it.
    const plan = planExport({ w: 16000, h: 100 }, 4);
    expect(plan.capped).toBe(true);
    expect(plan.w).toBeLessThanOrEqual(MAX_SIDE);
    expect(plan.w).toBeGreaterThan(MAX_SIDE - 2);
  });

  it("never reports a size over either limit, at any scale", () => {
    for (const scale of [0.25, 1, 2, 3, 4, 8, 64]) {
      for (const map of [LANDSCAPE, { w: 3000, h: 3000 }, { w: 3000, h: 4000 }]) {
        const plan = planExport(map, scale);
        expect(Math.max(plan.w, plan.h)).toBeLessThanOrEqual(MAX_SIDE);
        expect(plan.w * plan.h).toBeLessThanOrEqual(MAX_PIXELS);
        expect(plan.capped).toBe(plan.scale < scale);
      }
    }
  });

  it("keeps a canvas of at least one pixel", () => {
    expect(planExport(LANDSCAPE, 0.0001)).toMatchObject({ w: 1, h: 1, capped: false });
  });
});
