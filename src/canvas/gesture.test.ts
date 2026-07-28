import { describe, expect, it } from "vitest";
import type { Frame } from "../scene/frame";
import { resolveGesture } from "./gesture";

const frame: Frame = { cx: 200, cy: 200, width: 200, height: 200, rotation: 0 };
const base = { frame, overObject: false, shift: false, scale: 1 };

describe("resolveGesture", () => {
  it("puts handles above everything else", () => {
    expect(resolveGesture({ ...base, point: [100, 100] }).kind).toBe("scale");
    expect(resolveGesture({ ...base, point: [200, 100 - 26] }).kind).toBe("rotate");
  });

  /**
   * The drag has to keep showing the cursor of the corner it started on. Collapsing to
   * "scale" here lost that, and every drag fell back to one diagonal — so ne and sw
   * flipped to nwse-resize the moment you pressed.
   */
  it("carries which handle started the drag", () => {
    expect(resolveGesture({ ...base, point: [300, 100] })).toEqual({
      kind: "scale",
      handle: "ne",
    });
    expect(resolveGesture({ ...base, point: [100, 300] })).toEqual({
      kind: "scale",
      handle: "sw",
    });
    expect(resolveGesture({ ...base, point: [200, 74] })).toEqual({
      kind: "rotate",
      handle: "rotate",
    });
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
    expect(resolveGesture({ ...base, frame: undefined, point: [200, 200] }).kind).toBe("marquee");
  });

  it("keeps shift additive for marquees", () => {
    expect(resolveGesture({ ...base, point: [900, 900], shift: true })).toEqual({
      kind: "marquee",
      additive: true,
    });
  });
});
