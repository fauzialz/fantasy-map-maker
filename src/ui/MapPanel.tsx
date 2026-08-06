import { ChevronDown, Dices, Eye, EyeOff, Lock, LockOpen } from "lucide-react";
import { Collapsible } from "radix-ui";
import { useState } from "react";
import type { CanvasPreset, WorldType } from "../scene/types";
import { useEditorStore } from "../state/editorStore";
import { Slider, Toggle } from "./controls";
import { ConfirmDialog } from "./dialogs";
import { MapGallery } from "./MapGallery";
import { button, hint, layerRow, panel, panelTitle, segment, toolButton } from "./variants";

const PRESETS: CanvasPreset[] = ["landscape", "square", "portrait"];
const WORLD_TYPES: WorldType[] = ["single", "archipelago", "multiple"];

/**
 * The right rail: what the map *is*, as opposed to what the tool in your hand does.
 *
 * The layer list is fixed in both membership and order (ADR-15) — there are no freeform
 * layers to add or drag, and the stack order is what makes a map read correctly. What you
 * get per layer is visibility, a lock, and the count; reordering happens *within* a layer,
 * through the selection's forward/back in the tool rail.
 */
export function MapPanel({
  generating,
  onGenerate,
}: {
  generating: boolean;
  onGenerate: () => void;
}) {
  const scene = useEditorStore((s) => s.scene);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const setLayerFlags = useEditorStore((s) => s.setLayerFlags);
  const setSettings = useEditorStore((s) => s.setSettings);
  const record = useEditorStore((s) => s.record);
  const setTitle = useEditorStore((s) => s.setTitle);
  const newMap = useEditorStore((s) => s.newMap);
  const resetCanvas = useEditorStore((s) => s.resetCanvas);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [resetting, setResetting] = useState<CanvasPreset | null>(null);
  const generator = scene.generator;
  const setGenerator = useEditorStore((s) => s.setGenerator);
  const seaLevel = useEditorStore((s) => s.seaLevel);
  const mountainDensity = useEditorStore((s) => s.mountainDensity);
  const forestDensity = useEditorStore((s) => s.forestDensity);
  const setAdvanced = useEditorStore((s) => s.setAdvanced);

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

      <p className={panelTitle()}>Generator</p>
      <Slider
        label="Land amount"
        value={generator.landAmount}
        min={0.1}
        max={0.9}
        step={0.05}
        display={generator.landAmount.toFixed(2)}
        onChange={(landAmount) => setGenerator({ landAmount })}
      />
      <Slider
        label="Roughness"
        value={generator.roughness}
        min={0}
        max={1}
        step={0.05}
        display={generator.roughness.toFixed(2)}
        onChange={(roughness) => setGenerator({ roughness })}
      />
      <div className={segment()}>
        {WORLD_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={toolButton({ active: generator.worldType === type })}
            onClick={() => setGenerator({ worldType: type })}
          >
            {type}
          </button>
        ))}
      </div>

      <Collapsible.Root>
        <Collapsible.Trigger className="mbf:text-muted mbf:hover:text-ink mbf:group mbf:flex mbf:w-full mbf:cursor-pointer mbf:items-center mbf:gap-1 mbf:text-[11px]">
          <ChevronDown
            size={12}
            className="mbf:transition-transform mbf:group-data-[state=open]:rotate-180"
          />
          Advanced
        </Collapsible.Trigger>
        <Collapsible.Content className="mbf:mt-2 mbf:flex mbf:flex-col mbf:gap-3">
          <Toggle
            label="Set sea level by hand"
            checked={seaLevel !== null}
            onChange={(on) => setAdvanced({ seaLevel: on ? 0.5 : null })}
          />
          <Slider
            label="Sea level"
            value={seaLevel ?? 0.5}
            min={0.05}
            max={0.95}
            step={0.05}
            disabled={seaLevel === null}
            display={seaLevel === null ? "from land amount" : seaLevel.toFixed(2)}
            onChange={(value) => setAdvanced({ seaLevel: value })}
          />
          <Slider
            label="Mountain density"
            value={mountainDensity}
            min={0}
            max={1}
            step={0.05}
            display={mountainDensity.toFixed(2)}
            onChange={(value) => setAdvanced({ mountainDensity: value })}
          />
          <Slider
            label="Forest density"
            value={forestDensity}
            min={0}
            max={1}
            step={0.05}
            display={forestDensity.toFixed(2)}
            onChange={(value) => setAdvanced({ forestDensity: value })}
          />
        </Collapsible.Content>
      </Collapsible.Root>

      <div className={segment()}>
        <button
          type="button"
          className={button({ tone: "primary" })}
          disabled={generating}
          onClick={onGenerate}
        >
          {generating ? "Generating…" : "Generate world"}
        </button>
        <button
          type="button"
          className={button()}
          disabled={generating}
          onClick={() => setGenerator({ seed: Math.floor(Math.random() * 1e9) })}
        >
          <Dices size={13} /> Re-roll
        </button>
      </div>
      <p className="mbf:text-muted mbf:font-mono mbf:text-[10px]">seed {generator.seed}</p>

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
      <div className={segment()}>
        <button
          type="button"
          data-action="new-map"
          className={toolButton()}
          onClick={() => newMap(scene.meta.canvas.preset)}
        >
          New map
        </button>
        <button
          type="button"
          data-action="gallery"
          className={toolButton()}
          onClick={() => setGalleryOpen(true)}
        >
          My maps
        </button>
        <button
          type="button"
          data-action="reset"
          className={toolButton()}
          onClick={() => setResetting(scene.meta.canvas.preset)}
        >
          Reset
        </button>
      </div>
      <p className={hint()}>
        A new map keeps this one — both live in My maps. Reset empties this one.
      </p>

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

      <MapGallery open={galleryOpen} onOpenChange={setGalleryOpen} />
      <ConfirmDialog
        open={resetting !== null}
        title="Empty this map?"
        description={
          `This clears everything on “${scene.meta.title || "Untitled Map"}” and sets the ` +
          `canvas to ${resetting ?? ""}. The map keeps its name and its place in My maps, ` +
          `and you can undo it in one step.`
        }
        confirmLabel="Empty the map"
        onConfirm={() => resetting && resetCanvas(resetting)}
        onOpenChange={(next) => !next && setResetting(null)}
      />
    </aside>
  );
}
