import { describe, expect, it } from "vitest";
import { BIOME_FILL } from "./palette";

const BIOMES = ["grassland", "forest", "desert", "snow", "swamp"] as const;

describe("biome palette", () => {
  it("covers every biome in the data model", () => {
    // A missing entry renders a landmass with fill `undefined` — an invisible hole in
    // the map rather than a crash, so nothing else would catch it.
    for (const biome of BIOMES) expect(BIOME_FILL[biome]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(Object.keys(BIOME_FILL).sort()).toEqual([...BIOMES].sort());
  });
});
