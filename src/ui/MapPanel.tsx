import { Eye, EyeOff, Lock, LockOpen } from "lucide-react";
import { useEditorStore } from "../state/editorStore";
import { Slider, Toggle } from "./controls";
import { hint, layerRow, panel, panelTitle } from "./variants";

/**
 * The right rail — **live state you steer while looking at the map**, and nothing else
 * (`11` §2). Two sections since WP-32, down from five.
 *
 * What left: the generator went to its own dialog with WP-23; `New map` and `My maps` went to
 * the gallery page with WP-30; the title, the reset button and the canvas presets went to the
 * menu bar here. What stayed had to earn it — parchment, coastal rings, ring count and ring gap
 * all re-derive against the canvas as you drag them, which is exactly the test §2 sets. Land
 * amount and sea level look like siblings and are not: they only ever apply on the next
 * Generate, so they live in the dialog.
 *
 * The layer list is fixed in both membership and order (ADR-15) — there are no freeform layers
 * to add or drag, and the stack order is what makes a map read correctly. What you get per layer
 * is visibility, a lock, and the count; reordering happens *within* a layer, through the
 * selection's forward/back.
 */
export function MapPanel() {
  const scene = useEditorStore((s) => s.scene);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const setLayerFlags = useEditorStore((s) => s.setLayerFlags);
  const setSettings = useEditorStore((s) => s.setSettings);
  const record = useEditorStore((s) => s.record);

  return (
    <aside className={panel({ side: "right" })} aria-label="Map">
      <p className={panelTitle()}>Layers</p>
      <ul className="mbf:flex mbf:flex-col mbf:gap-0.5">
        {[...scene.layers].reverse().map((layer) => (
          <li key={layer.id} className={layerRow({ active: layer.id === activeLayerId })}>
            <button
              type="button"
              aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.id}`}
              data-layer-visible={layer.id}
              className="mbf:text-muted mbf:hover:text-ink mbf:cursor-pointer"
              onClick={() => setLayerFlags(layer.id, { visible: !layer.visible })}
            >
              {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button
              type="button"
              data-layer={layer.id}
              className="mbf:min-w-0 mbf:grow mbf:cursor-pointer mbf:truncate mbf:text-left mbf:capitalize"
              onClick={() => setActiveLayer(layer.id)}
            >
              {layer.id}
            </button>
            <span className="mbf:text-muted mbf:font-mono mbf:text-[10px]">
              {layer.objects.length}
            </span>
            <button
              type="button"
              aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.id}`}
              data-layer-locked={layer.id}
              className="mbf:text-muted mbf:hover:text-ink mbf:cursor-pointer"
              onClick={() => setLayerFlags(layer.id, { locked: !layer.locked })}
            >
              {layer.locked ? <Lock size={13} /> : <LockOpen size={13} />}
            </button>
          </li>
        ))}
      </ul>
      <p className={hint()}>
        Fixed order — the stack is what makes the map read correctly. Reorder <em>within</em> a
        layer from the tool rail.
      </p>

      <p className={panelTitle()}>Appearance</p>
      <Toggle
        label="Parchment texture"
        checked={scene.settings.parchment}
        onChange={(parchment) => record("parchment", () => setSettings({ parchment }))}
      />
      <Toggle
        label="Coastal rings"
        checked={scene.settings.coastalRings}
        onChange={(coastalRings) => record("show rings", () => setSettings({ coastalRings }))}
      />
      <Slider
        label="Ring count"
        value={scene.settings.ringCount}
        min={1}
        max={8}
        disabled={!scene.settings.coastalRings}
        onChange={(ringCount) => record("ring count", () => setSettings({ ringCount }), true)}
      />
      <Slider
        label="Ring gap"
        value={scene.settings.ringGap}
        min={4}
        max={60}
        step={2}
        disabled={!scene.settings.coastalRings}
        onChange={(ringGap) => record("ring gap", () => setSettings({ ringGap }), true)}
      />
    </aside>
  );
}
