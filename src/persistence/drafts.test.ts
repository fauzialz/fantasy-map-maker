import { describe, expect, it } from "vitest";
import { deserialize } from "../scene/scene";
import { createEmptyScene } from "../scene/scene";
import { draftRecord, renamedRecord } from "./drafts";

/**
 * IndexedDB itself is the browser's, and is verified by driven input (refresh and see the
 * map still there). What is worth pinning here is the record: whatever goes to disk has to
 * come back through `deserialize`, and has to carry the key P2's claim flow needs.
 */
describe("draftRecord", () => {
  it("keys the record on the scene's own client UUID", () => {
    const scene = createEmptyScene("square");
    expect(draftRecord(scene).id).toBe(scene.meta.id);
  });

  it("round-trips the scene through the (de)serialize contract", () => {
    const scene = createEmptyScene("portrait", "Westmarch");
    scene.layers[0].objects.push({
      id: "a",
      type: "landmass",
      path: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      holes: [],
      biome: "swamp",
    });

    const restored = deserialize(draftRecord(scene).json);
    expect(restored.meta.title).toBe("Westmarch");
    expect(restored.meta.canvas).toEqual({ preset: "portrait", w: 3000, h: 4000 });
    expect(restored.layers[0].objects).toEqual(scene.layers[0].objects);
  });

  it("stamps the save time without touching the scene it was given", () => {
    const scene = createEmptyScene();
    const at = new Date("2026-08-01T10:00:00.000Z");
    const record = draftRecord(scene, at);

    expect(record.updatedAt).toBe(at.toISOString());
    expect(deserialize(record.json).meta.updatedAt).toBe(at.toISOString());
    // A save is not an edit: writing the stamp back would make autosave its own trigger.
    expect(scene.meta.updatedAt).not.toBe(at.toISOString());
  });
});

describe("renamedRecord", () => {
  const record = () => draftRecord(createEmptyScene("landscape", "Old Name"));

  it("renames the row", () => {
    expect(renamedRecord(record(), "Westmarch").title).toBe("Westmarch");
  });

  /**
   * The bug this exists to catch. Writing only the row leaves the old name inside `json`,
   * so the gallery shows the new one, reopening the map silently reverts it, and an export
   * or a P1 `.map.json` carries the stale one.
   */
  it("renames the scene inside the record too", () => {
    expect(deserialize(renamedRecord(record(), "Westmarch").json).meta.title).toBe("Westmarch");
  });

  it("keeps the key, so a rename is not a new map", () => {
    const before = record();
    const after = renamedRecord(before, "Westmarch");
    expect(after.id).toBe(before.id);
    expect(deserialize(after.json).meta.id).toBe(before.id);
  });

  it("leaves the geometry alone", () => {
    const scene = createEmptyScene("square", "Old Name");
    scene.layers[0].objects.push({
      id: "lm",
      type: "landmass",
      path: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      holes: [],
      biome: "snow",
    });
    const renamed = deserialize(renamedRecord(draftRecord(scene), "New").json);
    expect(renamed.layers[0].objects).toEqual(scene.layers[0].objects);
    expect(renamed.meta.canvas).toEqual({ preset: "square", w: 3000, h: 3000 });
  });
});

describe("draftRecord, for the gallery", () => {
  it("carries the canvas size so a row need not parse the scene", () => {
    expect(draftRecord(createEmptyScene("portrait")).canvas).toEqual({ w: 3000, h: 4000 });
  });
});
