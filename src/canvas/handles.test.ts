import { describe, expect, it } from "vitest";
import type { Bounds } from "../scene/bounds";
import { cursorForHandle, cursorForHover, handleAt, handleKind } from "./handles";

const frame: Bounds = { minX: 100, minY: 100, maxX: 300, maxY: 300 };

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
      cursorForHover({ point, bounds: frame, selectionCount: 2, overObject, scale: 1 });

    expect(hover([100, 100])).toBe("nwse-resize");
    expect(hover([300, 100])).toBe("nesw-resize");
    expect(hover([200, 74])).toMatch(/^url\(/);
    expect(hover([200, 200])).toBe("move");
    expect(hover([900, 900], true)).toBe("pointer");
    expect(hover([900, 900])).toBeUndefined();
  });

  it("has no frame cursors when nothing is selected", () => {
    expect(
      cursorForHover({
        point: [200, 200],
        bounds: undefined,
        selectionCount: 0,
        overObject: false,
        scale: 1,
      }),
    ).toBeUndefined();
  });

  it("keeps handles reachable when zoomed out", () => {
    expect(
      cursorForHover({
        point: [120, 100],
        bounds: frame,
        selectionCount: 1,
        overObject: false,
        scale: 0.25,
      }),
    ).toBe("nwse-resize");
  });
});
