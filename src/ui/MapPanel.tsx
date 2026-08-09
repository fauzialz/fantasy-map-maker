import { Eye, EyeOff, Lock, LockOpen } from "lucide-react";
import { useState } from "react";
import type { CanvasPreset } from "../scene/types";
import { useEditorStore } from "../state/editorStore";
import { Slider, Toggle } from "./controls";
import { ConfirmDialog } from "./dialogs";
import { hint, layerRow, panel, panelTitle, segment, toolButton } from "./variants";

const PRESETS: CanvasPreset[] = ["landscape", "square", "portrait"];

/**
 * The right rail: what the map *is*, as opposed to what the tool in your hand does.
 *
 * The layer list is fixed in both membership and order (ADR-15) — there are no freeform
 * layers to add or drag, and the stack order is what makes a map read correctly. What you
 * get per layer is visibility, a lock, and the count; reordering happens *within* a layer,
 * through the selection's forward/back in the tool rail.
 */
export function MapPanel() {
  const scene = useEditorStore((s) => s.scene);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const setLayerFlags = useEditorStore((s) => s.setLayerFlags);
  const setSettings = useEditorStore((s) => s.setSettings);
  const record = useEditorStore((s) => s.record);
  const setTitle = useEditorStore((s) => s.setTitle);
  const resetCanvas = useEditorStore((s) => s.resetCanvas);
  const [resetting, setResetting] = useState<CanvasPreset | null>(null);

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

      <p className={panelTitle()}>Map settings</p>
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

      <p className={panelTitle()}>Map</p>
      <input
        data-map-title
        aria-label="Map name"
        value={scene.meta.title}
        placeholder="Untitled Map"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        className={
          "mbf:bg-panel mbf:border-line mbf:text-ink mbf:focus:border-accent mbf:rounded-md " +
          "mbf:border mbf:px-2 mbf:py-1 mbf:text-xs mbf:outline-none"
        }
      />
      {/*
        `New map` and `My maps` left with WP-30: they are "which map" commands, and the
        gallery page owns those (`14` §2). What is left here acts on the map in front of you.
      */}
      <div className={segment()}>
        <button
          type="button"
          data-action="reset"
          className={toolButton()}
          onClick={() => setResetting(scene.meta.canvas.preset)}
        >
          Reset canvas…
        </button>
      </div>

      <p className={panelTitle()}>Canvas</p>
      <div className={segment()}>
        {PRESETS.map((preset) => {
          const active = scene.meta.canvas.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              data-preset={preset}
              data-preset-active={active || undefined}
              className={toolButton({ active })}
              /**
               * Re-picking the size you are already on is a no-op, not a reset. Without
               * this the chip is a trap: tapping "landscape" to check it is selected asks
               * to destroy the map. Emptying it in place is the Reset button's job, which
               * says so on the tin.
               */
              onClick={() => !active && setResetting(preset)}
            >
              {preset}
            </button>
          );
        })}
      </div>
      <p className={hint()}>Changing the canvas size empties this map — undoable in one step.</p>

      <ConfirmDialog
        open={resetting !== null}
        title="Empty this map?"
        /**
         * The signpost matters more than it reads (`14` §4.9). With `New map` gone from the
         * editor, someone who wants a *fresh* map reaches for the nearest thing that sounds
         * close — and this is it. The confirm names the other door rather than only blocking
         * the wrong one.
         */
        description={
          `This clears everything on “${scene.meta.title || "Untitled Map"}” and sets the ` +
          `canvas to ${resetting ?? ""}. The map keeps its name and its place in Your maps, ` +
          `and you can undo it in one step. ` +
          `To start a fresh map and keep this one, cancel and choose New map in Your maps.`
        }
        confirmLabel="Empty the map"
        onConfirm={() => resetting && resetCanvas(resetting)}
        onOpenChange={(next) => !next && setResetting(null)}
      />
    </aside>
  );
}
