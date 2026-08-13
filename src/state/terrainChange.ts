import type { Landmass, Water } from "../scene/types";

/**
 * ADR-10: when a boolean op splits or merges land, "the larger piece keeps the id/name".
 * That is invisible unless we say so, so a commit that changed identity reports what
 * happened (and offers to undo it) — nothing should feel silently lost.
 *
 * Which id changes mean what depends on the tool: the sea brush can only split or erase,
 * the land brush can only create or merge.
 */
export function describeTerrainChange(
  before: Landmass[],
  after: Landmass[],
  mode: "paint" | "erase",
): string | null {
  const beforeIds = new Set(before.map((landmass) => landmass.id));
  const afterIds = new Set(after.map((landmass) => landmass.id));
  const created = after.filter((landmass) => !beforeIds.has(landmass.id));
  const removed = before.filter((landmass) => !afterIds.has(landmass.id));

  const label = (landmass: Landmass | undefined) =>
    landmass?.name ? `“${landmass.name}”` : "a landmass";

  if (mode === "erase") {
    if (created.length > 0) {
      const survivor = after.find((landmass) => beforeIds.has(landmass.id));
      const pieces = created.length + (survivor ? 1 : 0);
      return `${label(survivor)} split into ${pieces} — the larger piece kept the name`;
    }
    if (removed.length > 0) {
      return removed.length === 1
        ? `${label(removed[0])} erased`
        : `${removed.length} landmasses erased`;
    }
    return null;
  }

  // Painting only ever adds land, so a disappearing id means two masses were bridged.
  if (removed.length > 0) {
    const survivor = after.find((landmass) => beforeIds.has(landmass.id));
    return `${removed.length + 1} landmasses merged into ${label(survivor)}`;
  }
  return null;
}

/**
 * WP-42 — what painting land did to the water it crossed (D18).
 *
 * Worth saying for the same reason `describeTerrainChange` exists: a stroke aimed at the coast
 * can sever a river a screen away, or wipe a small pond out entirely, and neither announces
 * itself. **The wipe is the one that must never be silent** — it is the only edit in the batch
 * that destroys an object the user did not point at, and it is destructive by C8's necessity
 * rather than by choice, so undo is the only way back.
 */
export function describeWaterChange(before: Water[], after: Water[]): string | null {
  if (after.length > before.length) {
    const extra = after.length - before.length;
    return `A river was severed into ${extra + 1} — painting land cuts water`;
  }
  if (after.length < before.length) {
    const gone = before.length - after.length;
    return gone === 1 ? "A water body was covered over" : `${gone} water bodies were covered over`;
  }
  return null;
}
