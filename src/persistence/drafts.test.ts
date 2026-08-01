import { describe, expect, it } from "vitest";
import { deserialize } from "../scene/scene";
import { createEmptyScene } from "../scene/scene";
import { draftRecord } from "./drafts";

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
