import { describe, expect, it } from "vitest";
import type { Bounds } from "../scene/bounds";
import { resolveGesture } from "./gesture";

const frame: Bounds = { minX: 100, minY: 100, maxX: 300, maxY: 300 };
const base = { bounds: frame, selectionCount: 2, overObject: false, shift: false, scale: 1 };

describe("resolveGesture", () => {
  it("puts handles above everything else", () => {
    expect(resolveGesture({ ...base, point: [100, 100] }).kind).toBe("scale");
    expect(resolveGesture({ ...base, point: [200, 100 - 26] }).kind).toBe("rotate");
  });

  it("treats a press inside the frame as a move of the whole selection", () => {
    expect(resolveGesture({ ...base, point: [200, 200] }).kind).toBe("move");
    // even when an object is under the cursor — that is how you drag a range
    expect(resolveGesture({ ...base, point: [200, 200], overObject: true }).kind).toBe("move");
  });

  it("picks an object outside the frame", () => {
    const gesture = resolveGesture({ ...base, point: [900, 900], overObject: true });
    expect(gesture).toEqual({ kind: "pick", additive: false });
  });

  it("marquees on empty space", () => {
    expect(resolveGesture({ ...base, point: [900, 900] })).toEqual({
      kind: "marquee",
      additive: false,
    });
  });

  /**
   * The regression this file exists for: shift-clicking an object that is already
   * selected used to land inside the selection frame and start a drag, so the object
   * could never be deselected.
   */
  it("lets shift reach an object inside the selection frame", () => {
    expect(resolveGesture({ ...base, point: [200, 200], overObject: true, shift: true })).toEqual({
      kind: "pick",
      additive: true,
    });
  });

  it("lets shift reach past the handles too", () => {
    expect(resolveGesture({ ...base, point: [100, 100], overObject: true, shift: true }).kind).toBe(
      "pick",
    );
    expect(resolveGesture({ ...base, point: [100, 100], shift: true }).kind).toBe("marquee");
  });

  it("has no frame shortcuts when nothing is selected", () => {
    expect(
      resolveGesture({ ...base, bounds: undefined, selectionCount: 0, point: [200, 200] }).kind,
    ).toBe("marquee");
  });

  it("keeps shift additive for marquees", () => {
    expect(resolveGesture({ ...base, point: [900, 900], shift: true })).toEqual({
      kind: "marquee",
      additive: true,
    });
  });
});
