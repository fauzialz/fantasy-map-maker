import { describe, expect, it } from "vitest";
import type { Frame } from "../scene/frame";
import { cursorForHandle, cursorForHover, handleAt, handleKind } from "./handles";

/** 200x200, centred on (200,200) — the same box the old Bounds described. */
const frame: Frame = { cx: 200, cy: 200, width: 200, height: 200, rotation: 0 };

describe("handleAt", () => {
  it("names the corner it found", () => {
    expect(handleAt(frame, [100, 100], 1)).toBe("nw");
    expect(handleAt(frame, [300, 100], 1)).toBe("ne");
    expect(handleAt(frame, [100, 300], 1)).toBe("sw");
    expect(handleAt(frame, [300, 300], 1)).toBe("se");
  });

  it("finds the rotate knob on its stalk", () => {
    expect(handleAt(frame, [200, 100 - 26], 1)).toBe("rotate");
  });

  it("collapses to the kind the gesture layer cares about", () => {
    expect(handleKind("nw")).toBe("scale");
    expect(handleKind("se")).toBe("scale");
    expect(handleKind("rotate")).toBe("rotate");
  });
});

describe("cursors", () => {
  it("matches the diagonal of the corner", () => {
    // The frame stays axis-aligned however the objects inside are rotated, so these
    // never need to swap.
    expect(cursorForHandle("nw")).toBe("nwse-resize");
    expect(cursorForHandle("se")).toBe("nwse-resize");
    expect(cursorForHandle("ne")).toBe("nesw-resize");
    expect(cursorForHandle("sw")).toBe("nesw-resize");
  });

  it("draws its own rotate cursor, since CSS has none", () => {
    const cursor = cursorForHandle("rotate");
    expect(cursor).toMatch(/^url\("data:image\/svg\+xml/);
    // hotspot at the centre of a 24px icon, with a keyword fallback
    expect(cursor).toMatch(/\) 12 12, grab$/);
    expect(cursor).not.toContain("#"); // an unescaped # would truncate the data URI
  });

  it("advertises what a press would do", () => {
    const hover = (point: [number, number], overObject = false) =>
      cursorForHover({ point, frame, overObject, scale: 1 });

    expect(hover([100, 100])).toBe("nwse-resize");
    expect(hover([300, 100])).toBe("nesw-resize");
    expect(hover([200, 74])).toMatch(/^url\(/);
    expect(hover([200, 200])).toBe("move");
    expect(hover([900, 900], true)).toBe("pointer");
    expect(hover([900, 900])).toBeUndefined();
  });

  it("has no frame cursors when nothing is selected", () => {
    expect(
      cursorForHover({ point: [200, 200], frame: undefined, overObject: false, scale: 1 }),
    ).toBeUndefined();
  });

  it("keeps handles reachable when zoomed out", () => {
    expect(cursorForHover({ point: [120, 100], frame, overObject: false, scale: 0.25 })).toBe(
      "nwse-resize",
    );
  });

  /**
   * I4, on the rung WP-20 added. The pointer has to resolve the *same* ladder the press
   * does — a corner that shows "nwse-resize" while the press reshapes a river is bug #2
   * with the parts swapped, and that is the whole reason bug #2 stayed invisible.
   */
  describe("over a control point", () => {
    const hover = (point: [number, number], extra = {}) =>
      cursorForHover({ point, frame, overObject: false, scale: 1, ...extra });

    it("shows its own cursor, not the handle's, where the two collide", () => {
      expect(hover([100, 100])).toBe("nwse-resize");
      expect(hover([100, 100], { overControlPoint: true })).toBe("grab");
    });

    it("outranks the frame interior, exactly as the press does", () => {
      expect(hover([200, 200])).toBe("move");
      expect(hover([200, 200], { overControlPoint: true })).toBe("grab");
    });

    it("says nothing about the empty interior of a path-only selection", () => {
      // The pair `useSelection` actually produces for a river: the box is inert, so the
      // water inside it must read as a marquee (undefined) and not as a move.
      expect(hover([200, 200], { frameInterior: false })).toBeUndefined();
    });
  });
});
