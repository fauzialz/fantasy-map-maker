import { describe, expect, it } from "vitest";
import type { Landmass } from "../scene/types";
import { describeTerrainChange } from "./terrainChange";

const land = (id: string, name?: string): Landmass => ({
  id,
  type: "landmass",
  path: [
    [0, 0],
    [10, 0],
    [10, 10],
  ],
  holes: [],
  biome: "grassland",
  name,
});

describe("describeTerrainChange", () => {
  it("reports a sea-brush split and names the piece that kept the name", () => {
    const message = describeTerrainChange(
      [land("a", "Continent")],
      [land("a", "Continent"), land("new")],
      "erase",
    );
    expect(message).toBe("“Continent” split into 2 — the larger piece kept the name");
  });

  it("reports an erased landmass", () => {
    expect(describeTerrainChange([land("a", "Isle")], [], "erase")).toBe("“Isle” erased");
    expect(describeTerrainChange([land("a"), land("b")], [], "erase")).toBe("2 landmasses erased");
  });

  it("reports a merge when painting bridges two landmasses", () => {
    expect(
      describeTerrainChange([land("a", "West"), land("b", "East")], [land("a", "West")], "paint"),
    ).toBe("2 landmasses merged into “West”");
  });

  it("stays quiet when nothing about identity changed", () => {
    // Painting a detached blob creates an id, but nothing was split or lost.
    expect(describeTerrainChange([land("a")], [land("a"), land("b")], "paint")).toBeNull();
    // Erasing open water changes nothing at all.
    expect(describeTerrainChange([land("a")], [land("a")], "erase")).toBeNull();
    expect(describeTerrainChange([], [], "paint")).toBeNull();
  });

  it("falls back gracefully when the landmass has no name", () => {
    expect(describeTerrainChange([land("a")], [land("a"), land("new")], "erase")).toBe(
      "a landmass split into 2 — the larger piece kept the name",
    );
  });
});
