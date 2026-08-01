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

/**
 * WP-20 — a control point outranks everything, because on a river the two genuinely
 * collide: an endpoint is usually *at* a frame corner, since it is the point that defines
 * that corner. `frame` here is the one at the top of the file, whose "nw" handle sits at
 * (100, 100).
 */
describe("control points, the top rung", () => {
  it("beats a frame handle sitting on the same pixel", () => {
    expect(resolveGesture({ ...base, point: [100, 100] }).kind).toBe("scale");
    expect(resolveGesture({ ...base, point: [100, 100], overControlPoint: true })).toEqual({
      kind: "reshape",
    });
  });

  it("beats the frame interior and the object under it", () => {
    expect(
      resolveGesture({ ...base, point: [200, 200], overObject: true, overControlPoint: true }).kind,
    ).toBe("reshape");
  });

  /**
   * I5's escape applies to every shortcut, not just the ones that existed when it was
   * written: shift means "change the selection", so it must still reach the river under
   * the point rather than starting a reshape it can never get out of.
   */
  it("still lets shift through to change the selection", () => {
    expect(
      resolveGesture({
        ...base,
        point: [200, 200],
        overObject: true,
        overControlPoint: true,
        shift: true,
      }),
    ).toEqual({ kind: "pick", additive: true });
  });
});

/**
 * `09` S8 / E14 — the frame draws the selection but must never *pick* it, and that
 * includes the interior rung. A sprite's box hugs its artwork so the interior is a fair
 * stand-in; a crescent continent's box is mostly open sea (C4), so it is not.
 */
describe("an inert frame interior", () => {
  const frame = { cx: 100, cy: 100, width: 200, height: 200, rotation: 0 };

  it("still moves the selection when the interior is live", () => {
    expect(
      resolveGesture({ point: [100, 100], frame, overObject: false, shift: false, scale: 1 }).kind,
    ).toBe("move");
  });

  it("falls through to a marquee when the interior is inert and nothing is under the point", () => {
    expect(
      resolveGesture({
        point: [100, 100],
        frame,
        overObject: false,
        shift: false,
        scale: 1,
        frameInterior: false,
      }).kind,
    ).toBe("marquee");
  });

  it("still picks an object inside an inert interior", () => {
    expect(
      resolveGesture({
        point: [100, 100],
        frame,
        overObject: true,
        shift: false,
        scale: 1,
        frameInterior: false,
      }).kind,
    ).toBe("pick");
  });

  it("keeps the handles live regardless — they sit on the frame, not inside it", () => {
    const corner = { x: 0, y: 0 };
    const onHandle = resolveGesture({
      point: [corner.x, corner.y],
      frame,
      overObject: false,
      shift: false,
      scale: 1,
      frameInterior: false,
    });
    expect(onHandle.kind).toBe("scale");
  });
});
