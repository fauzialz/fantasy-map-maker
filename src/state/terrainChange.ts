import type { Landmass } from "../scene/types";

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
