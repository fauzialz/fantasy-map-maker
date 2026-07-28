import { useMemo } from "react";
import { Shape } from "react-konva";
import { inDrawOrder } from "../../scene/order";
import type { SceneObject } from "../../scene/types";
import { drawSprite } from "../../sprites/raster";

/**
 * Every sprite object in a layer is drawn by ONE Konva shape rather than one node each.
 *
 * A scattered forest is 1–2k objects; a node apiece means that many nodes to build,
 * transform and hit-test per frame. Batching keeps it to a single draw loop over cached
 * sprite bitmaps. Nothing is lost: per-object hit-testing is rbush's job (ADR-16), not
 * Konva's, and sorting happens here anyway.
 *
 * ponytail: the whole batch redraws on any change, so a scatter stroke redraws every
 * object in the layer per placement. Fine at the ~1-2k budget; if it ever isn't, the
 * upgrade is drawing only the dirty rect rather than splitting into nodes.
 */
export function ObjectBatch({ objects }: { objects: SceneObject[] }) {
  const sorted = useMemo(() => inDrawOrder(objects), [objects]);

  return (
    <Shape
      listening={false}
      sceneFunc={(context) => {
        const raw = context as unknown as CanvasRenderingContext2D;
        for (const object of sorted) {
          if (object.type !== "mountain" && object.type !== "tree") continue;
          drawSprite(
            raw,
            object.type,
            object.variant,
            object.x,
            object.y,
            object.scale,
            object.rotation,
          );
        }
      }}
    />
  );
}
