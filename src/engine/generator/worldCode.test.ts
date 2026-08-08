import { describe, expect, it } from "vitest";
import { formatWorldCode, parseWorldCode, type WorldInputs } from "./worldCode";

const inputs = (overrides: Partial<WorldInputs> = {}): WorldInputs => ({
  seed: 483920104,
  landAmount: 0.4,
  roughness: 0.6,
  worldType: "single",
  seaLevel: null,
  mountainDensity: 0.5,
  forestDensity: 0.5,
  ...overrides,
});

describe("worldCode", () => {
  it("writes the documented shape", () => {
    expect(formatWorldCode(inputs())).toBe("w1-483920104-0.40-0.60-single-auto-0.50-0.50");
  });

  it("round-trips every input", () => {
    const world = inputs({
      seed: 7,
      landAmount: 0.85,
      roughness: 0.05,
      worldType: "archipelago",
      seaLevel: 0.35,
      mountainDensity: 0,
      forestDensity: 1,
    });
    expect(parseWorldCode(formatWorldCode(world))).toEqual(world);
  });

  it("normalises the float drift a stepped slider accumulates", () => {
    // 0.1 + 0.05 × 4 is 0.30000000000000004 in binary floating point, and a code that
    // carried that verbatim would not compare equal to the same world set by hand.
    const drifted = inputs({ landAmount: 0.1 + 0.05 * 4 });
    expect(parseWorldCode(formatWorldCode(drifted))?.landAmount).toBe(0.3);
  });

  it("survives the mangling a chat client applies", () => {
    expect(parseWorldCode("  W1-483920104-0.40-0.60-SINGLE-auto-0.50-0.50\n")).toEqual(inputs());
  });

  it.each([
    ["garbage", "not a world code at all"],
    ["w2-483920104-0.40-0.60-single-auto-0.50-0.50", "a future version"],
    ["w1-483920104-0.40-0.60-single-auto-0.50", "a field short"],
    ["w1-483920104-0.40-0.60-single-auto-0.50-0.50-0.50", "a field long"],
    ["w1-483920104-0.40-0.60-continent-auto-0.50-0.50", "an unknown world type"],
    ["w1-483920104-9.90-0.60-single-auto-0.50-0.50", "land amount out of range"],
    ["w1-483920104-0.40-0.60-single-1.50-0.50-0.50", "sea level above its slider"],
    ["w1-1.5-0.40-0.60-single-auto-0.50-0.50", "a fractional seed"],
    ["w1-abc-0.40-0.60-single-auto-0.50-0.50", "a non-numeric seed"],
    ["w1--0.40-0.60-single-auto-0.50-0.50", "an empty field"],
    ["", "nothing"],
  ])("rejects %j — %s", (code) => {
    expect(parseWorldCode(code)).toBeNull();
  });
});
