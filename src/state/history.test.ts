import { describe, expect, it } from "vitest";
import { createEmptyScene } from "../scene/scene";
import type { Landmass, LayerId, Mountain, Scene, SceneObject } from "../scene/types";
import { applyStep, coalesce, diffScene, HISTORY_LIMIT, pushStep, type Step } from "./history";

/**
 * The undo stack is what stands between the user and losing work, and every one of these
 * four functions is pure — so they are testable in Node with no canvas, no store and no
 * fixtures beyond `createEmptyScene`.
 */

const mountain = (id: string, x = 100, y = 100): Mountain => ({
  id,
  type: "mountain",
  x,
  y,
  rotation: 0,
  scale: 1,
  z: 0,
  variant: 2,
});

const landmass = (id: string, x = 0): Landmass => ({
  id,
  type: "landmass",
  path: [
    [x, 0],
    [x + 10, 0],
    [x + 10, 10],
    [x, 10],
  ],
  holes: [],
  biome: "grassland",
});

const withObjects = (scene: Scene, layerId: LayerId, objects: SceneObject[]): Scene => ({
  ...scene,
  layers: scene.layers.map((layer) => (layer.id === layerId ? { ...layer, objects } : layer)),
});

const objectsOf = (scene: Scene, layerId: LayerId): SceneObject[] =>
  scene.layers.find((layer) => layer.id === layerId)?.objects ?? [];

const layerOf = (scene: Scene, layerId: LayerId) =>
  scene.layers.find((layer) => layer.id === layerId);

const base = () => createEmptyScene("landscape");

// ------------------------------------------------------------------ diffScene

describe("diffScene", () => {
  it("returns null when nothing changed", () => {
    const scene = withObjects(base(), "mountains", [mountain("m1")]);
    expect(diffScene(scene, scene, "noop")).toBeNull();
    // A new scene object holding the same layers is still no change.
    expect(diffScene(scene, { ...scene }, "noop")).toBeNull();
  });

  it("records only the objects an action touched, not the whole layer", () => {
    const before = withObjects(base(), "mountains", [
      mountain("m1"),
      mountain("m2"),
      mountain("m3"),
    ]);
    const after = withObjects(before, "mountains", [
      mountain("m1"),
      { ...mountain("m2"), x: 500 },
      mountain("m3"),
    ]);

    const step = diffScene(before, after, "move");
    expect(step?.layers).toHaveLength(1);
    expect(step?.layers[0].layerId).toBe("mountains");
    expect(step?.layers[0].before.map((o) => o.id)).toEqual(["m2"]);
    expect(step?.layers[0].after.map((o) => o.id)).toEqual(["m2"]);
  });

  it("keeps a terrain step to the landmasses that changed", () => {
    const before = withObjects(base(), "terrain", [landmass("a"), landmass("b", 100)]);
    const after = withObjects(before, "terrain", [landmass("a"), landmass("b", 400)]);

    const step = diffScene(before, after, "paint land");
    expect(step?.layers[0].before.map((o) => o.id)).toEqual(["b"]);
  });

  it("ignores objects that are new instances but identical in value", () => {
    // The geometry worker hands back a fresh object for every landmass, changed or not.
    // Reference equality alone would drop the whole terrain layer into every stroke.
    const before = withObjects(base(), "terrain", [landmass("a"), landmass("b", 100)]);
    const after = withObjects(before, "terrain", [landmass("a"), landmass("b", 100)]);

    expect(objectsOf(after, "terrain")[0]).not.toBe(objectsOf(before, "terrain")[0]);
    expect(diffScene(before, after, "paint land")).toBeNull();
  });

  it("records a creation as absent-before, present-after", () => {
    const before = base();
    const after = withObjects(before, "mountains", [mountain("m1")]);

    const step = diffScene(before, after, "place");
    expect(step?.layers[0].before).toEqual([]);
    expect(step?.layers[0].after.map((o) => o.id)).toEqual(["m1"]);
  });

  it("records a deletion as present-before, absent-after", () => {
    const before = withObjects(base(), "mountains", [mountain("m1")]);
    const after = withObjects(before, "mountains", []);

    const step = diffScene(before, after, "delete");
    expect(step?.layers[0].before.map((o) => o.id)).toEqual(["m1"]);
    expect(step?.layers[0].after).toEqual([]);
  });

  it("records a settings change separately from objects", () => {
    const before = base();
    const after: Scene = { ...before, settings: { ...before.settings, ringGap: 30 } };

    const step = diffScene(before, after, "ring gap");
    expect(step?.layers).toEqual([]);
    expect(step?.settings?.before.ringGap).toBe(before.settings.ringGap);
    expect(step?.settings?.after.ringGap).toBe(30);
  });

  it("spans several layers in one step", () => {
    const before = base();
    const after = withObjects(withObjects(before, "mountains", [mountain("m1")]), "forests", [
      { ...mountain("t1"), type: "tree" } as SceneObject,
    ]);

    expect(diffScene(before, after, "generate")?.layers.map((d) => d.layerId)).toEqual([
      "forests",
      "mountains",
    ]);
  });
});

// ------------------------------------------------------------------ applyStep

describe("applyStep", () => {
  it("undoes a creation and redoes it", () => {
    const before = base();
    const after = withObjects(before, "mountains", [mountain("m1")]);
    const step = diffScene(before, after, "place")!;

    const undone = applyStep(after, step, "undo");
    expect(objectsOf(undone, "mountains")).toEqual([]);

    const redone = applyStep(undone, step, "redo");
    expect(objectsOf(redone, "mountains").map((o) => o.id)).toEqual(["m1"]);
  });

  it("restores a deleted object with its properties intact", () => {
    const original = mountain("m1", 640, 480);
    const before = withObjects(base(), "mountains", [original]);
    const after = withObjects(before, "mountains", []);
    const step = diffScene(before, after, "delete")!;

    expect(objectsOf(applyStep(after, step, "undo"), "mountains")[0]).toEqual(original);
  });

  it("round-trips a move: undo then redo lands back where it was", () => {
    const before = withObjects(base(), "mountains", [mountain("m1"), mountain("m2", 200, 200)]);
    const after = withObjects(before, "mountains", [
      mountain("m1"),
      { ...mountain("m2", 200, 200), x: 900, y: 950 },
    ]);
    const step = diffScene(before, after, "move")!;

    const undone = applyStep(after, step, "undo");
    expect(objectsOf(undone, "mountains")).toEqual(objectsOf(before, "mountains"));
    expect(objectsOf(applyStep(undone, step, "redo"), "mountains")).toEqual(
      objectsOf(after, "mountains"),
    );
  });

  it("reverts a settings change", () => {
    const before = base();
    const after: Scene = { ...before, settings: { ...before.settings, parchment: false } };
    const step = diffScene(before, after, "parchment")!;

    expect(applyStep(after, step, "undo").settings.parchment).toBe(true);
    expect(applyStep(after, step, "redo").settings.parchment).toBe(false);
  });

  it("leaves untouched layers by the same reference, so cached layers stay cached", () => {
    const before = withObjects(base(), "mountains", [mountain("m1")]);
    const after = withObjects(before, "mountains", [mountain("m1"), mountain("m2")]);
    const step = diffScene(before, after, "place")!;

    const undone = applyStep(after, step, "undo");
    expect(layerOf(undone, "forests")).toBe(layerOf(after, "forests"));
    expect(layerOf(undone, "terrain")).toBe(layerOf(after, "terrain"));
    expect(layerOf(undone, "mountains")).not.toBe(layerOf(after, "mountains"));
  });

  it("replaces everything for a whole-scene step, canvas included", () => {
    const before = withObjects(base(), "mountains", [mountain("m1")]);
    const after = createEmptyScene("portrait");
    const step: Step = { label: "new portrait canvas", layers: [], scene: { before, after } };

    const undone = applyStep(after, step, "undo");
    expect(undone.meta.canvas.preset).toBe("landscape");
    expect(objectsOf(undone, "mountains").map((o) => o.id)).toEqual(["m1"]);
    expect(applyStep(undone, step, "redo").meta.canvas.preset).toBe("portrait");
  });
});

// ------------------------------------------------------------------ coalesce

describe("coalesce", () => {
  const sizeStep = (from: number, to: number): Step => ({
    label: "resize label",
    layers: [
      {
        layerId: "labels",
        before: [{ ...mountain("L1"), type: "label", text: "x", font: "f", size: from } as never],
        after: [{ ...mountain("L1"), type: "label", text: "x", font: "f", size: to } as never],
      },
    ],
  });

  it("folds two steps on the same target into one spanning both", () => {
    const merged = coalesce(sizeStep(10, 20), sizeStep(20, 30));
    expect(merged).not.toBeNull();

    const [diff] = merged!.layers;
    expect((diff.before[0] as { size: number }).size).toBe(10);
    expect((diff.after[0] as { size: number }).size).toBe(30);
  });

  it("folds settings steps, keeping the older before and the newer after", () => {
    const scene = base();
    const step = (gap: number, next: number): Step => ({
      label: "ring gap",
      layers: [],
      settings: {
        before: { ...scene.settings, ringGap: gap },
        after: { ...scene.settings, ringGap: next },
      },
    });

    const merged = coalesce(step(14, 20), step(20, 40));
    expect(merged?.settings?.before.ringGap).toBe(14);
    expect(merged?.settings?.after.ringGap).toBe(40);
  });

  it("refuses steps with different labels", () => {
    expect(coalesce(sizeStep(10, 20), { ...sizeStep(20, 30), label: "move" })).toBeNull();
  });

  it("refuses steps that touch different objects", () => {
    const other = sizeStep(20, 30);
    other.layers[0].before[0] = { ...other.layers[0].before[0], id: "L2" };
    other.layers[0].after[0] = { ...other.layers[0].after[0], id: "L2" };
    expect(coalesce(sizeStep(10, 20), other)).toBeNull();
  });

  it("refuses whole-scene steps", () => {
    const scene = base();
    const whole: Step = { label: "generate", layers: [], scene: { before: scene, after: scene } };
    expect(coalesce(whole, whole)).toBeNull();
  });
});

// ------------------------------------------------------------------ pushStep

describe("pushStep", () => {
  const step = (label: string): Step => ({ label, layers: [] });

  it("appends while there is room", () => {
    expect(pushStep([step("a")], step("b")).map((s) => s.label)).toEqual(["a", "b"]);
  });

  it("caps the stack, dropping the oldest and keeping the newest", () => {
    let past: Step[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) past = pushStep(past, step(`s${i}`));

    expect(past).toHaveLength(HISTORY_LIMIT);
    expect(past[past.length - 1].label).toBe(`s${HISTORY_LIMIT + 9}`);
    expect(past[0].label).toBe(`s${10}`);
  });
});
