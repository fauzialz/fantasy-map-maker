import { ChevronsDown, ChevronsUp, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { hasFootprint } from "../scene/bounds";
import { BIOME_FILL } from "../canvas/palette";
import type { Biome, Label, Landmass } from "../scene/types";
import { ICON_KINDS } from "../sprites/registry";
import { LAYER_OBJECT, LAYER_TOOLS, useEditorStore, type ObjectTool } from "../state/editorStore";
import { Slider } from "./controls";
import {
  button,
  field,
  fieldLabel,
  hint,
  panel,
  panelTitle,
  segment,
  toolButton,
} from "./variants";

/** What each placement mode is called on the layer that offers it (ADR-14, ADR-18). */
const TOOL_LABEL: Record<ObjectTool, string> = {
  select: "Select",
  scatter: "Scatter",
  place: "Place one",
  erase: "Erase",
};
// `select: "Edit"` left with WP-25 — a third name for the global mode. `RIVER_TOOL_LABEL`
// ("Draw", for the river tool's one placement mode) left with WP-40, which deleted that tool;
// the water layer offers nothing to create until WP-41's brush arrives.

/**
 * The contextual left rail — options for whatever tool is in hand, and nothing else. It is
 * a second view of the same store the toolbar writes, never a second source of truth.
 */
export function ToolOptions({ onEditLabel }: { onEditLabel: (label: Label) => void }) {
  const scene = useEditorStore((s) => s.scene);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const brushSize = useEditorStore((s) => s.brushSize);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const waterTool = useEditorStore((s) => s.waterTool);
  /** Carving makes sea; laying and the spline make rivers. The tab is that distinction. */
  const waterTab = waterTool === "carve" ? "sea" : "river";
  const setWaterTool = useEditorStore((s) => s.setWaterTool);
  const splineMinWidth = useEditorStore((s) => s.splineMinWidth);
  const splineMaxWidth = useEditorStore((s) => s.splineMaxWidth);
  const splineRoughness = useEditorStore((s) => s.splineRoughness);
  const setSpline = useEditorStore((s) => s.setSpline);
  const objectTool = useEditorStore((s) => s.objectTool);
  const scatterRotation = useEditorStore((s) => s.scatterRotation);
  const setScatterRotation = useEditorStore((s) => s.setScatterRotation);
  const spriteScale = useEditorStore((s) => s.spriteScale);
  const setSpriteScale = useEditorStore((s) => s.setSpriteScale);
  const spriteSpacing = useEditorStore((s) => s.spriteSpacing);
  const setSpriteSpacing = useEditorStore((s) => s.setSpriteSpacing);
  const setObjectTool = useEditorStore((s) => s.setObjectTool);
  const iconKind = useEditorStore((s) => s.iconKind);
  const setIconKind = useEditorStore((s) => s.setIconKind);
  const labelSize = useEditorStore((s) => s.labelSize);
  const setLabelSize = useEditorStore((s) => s.setLabelSize);
  const selection = useEditorStore((s) => s.selection);
  const setSettings = useEditorStore((s) => s.setSettings);
  const patchObject = useEditorStore((s) => s.patchObject);
  const record = useEditorStore((s) => s.record);
  const deleteSelection = useEditorStore((s) => s.deleteSelection);
  const restackSelection = useEditorStore((s) => s.restackSelection);
  const terrainBiome = useEditorStore((s) => s.terrainBiome);
  const setTerrainBiome = useEditorStore((s) => s.setTerrainBiome);
  const overlapPolicy = useEditorStore((s) => s.overlapPolicy);
  const setOverlapPolicy = useEditorStore((s) => s.setOverlapPolicy);

  const onTerrain = activeLayerId === "terrain";
  const onWater = activeLayerId === "water";
  const tools = LAYER_TOOLS[activeLayerId];
  const isObjectLayer = LAYER_OBJECT[activeLayerId] !== undefined;
  /** Which sprite the active layer makes, so the size knob edits that kind's setting. */
  const spriteKind = LAYER_OBJECT[activeLayerId];
  const selecting = objectTool === "select";
  /**
   * Erase is a global mode (ADR-37), so the rail must not go on offering the *active layer's*
   * controls underneath it: a biome palette above an eraser describes a tool that is not in
   * your hand. The disc is the whole tool, so its size is the whole option.
   */
  const erasing = objectTool === "erase";
  /**
   * Select and Erase act on what is already on the map, so neither inherits the active
   * layer's *create* options — the rail follows the tool in your hand, not the layer you
   * happen to be standing on. Erase got this guard when it went global (ADR-37) and Select
   * never did, which left a biome palette sitting under a tool that creates nothing.
   */
  const globalMode = selecting || erasing;
  /** The land brush, as opposed to the sea brush — they take different options. */
  /** The terrain brush only paints land now — removing it is the water layer's Sea tab. */
  const paintingLand = onTerrain;
  /** Both terrain brushes answer to the terrain layer's own flags, hidden as well as locked. */
  const terrainLayer = scene.layers.find((layer) => layer.id === "terrain");
  const terrainEditable = !!terrainLayer?.visible && !terrainLayer.locked;
  const waterLayer = scene.layers.find((layer) => layer.id === "water");
  const waterEditable = !!waterLayer?.visible && !waterLayer.locked;

  /**
   * A selection can now span layers (ADR-28), so what the rail offers follows the selected
   * *objects*, not the active layer: shared controls always, and the type-specific ones only
   * when every selected object is that type. A text-size slider over a mixed bag of trees
   * and labels would have to either edit nothing or lie about what it edits.
   */
  const selected = useMemo(() => {
    const ids = new Set(selection);
    return scene.layers.flatMap((layer) => layer.objects.filter((o) => ids.has(o.id)));
  }, [scene.layers, selection]);
  const onlyType =
    selected.length > 0 && selected.every((o) => o.type === selected[0].type)
      ? selected[0].type
      : undefined;
  /** Whether anything in the selection answers to the frame's handles (I9's footprint side). */
  const transformable = selected.some(hasFootprint);
  const selectedLand = selected.filter((o): o is Landmass => o.type === "landmass");
  /**
   * Both substances, for the overlap policy. A dropped water body lands on other water exactly
   * as a landmass lands on land, so the control that governs that is not a terrain control —
   * it is a **path-object** control, and it was only ever gated on land because water could
   * not be selected before WP-41.
   */
  const selectedPaths = selected.filter((o) => o.type === "landmass" || o.type === "water");

  /**
   * The palette does double duty (D6): with land selected it recolours it in one undo step,
   * with nothing selected it sets what the brush will paint next. One control, because
   * "which biome" is one question — and it is why a hand-painted continent stopped being
   * grassland-or-nothing.
   */
  const pickBiome = (biome: Biome) => {
    if (selectedLand.length === 0) {
      setTerrainBiome(biome);
      return;
    }
    const state = useEditorStore.getState();
    state.record("set biome", () => {
      for (const landmass of selectedLand) {
        state.patchObject<Landmass>("terrain", landmass.id, { biome });
      }
    });
  };
  /** The one selected label, so the size slider edits the thing rather than the default. */
  const editingLabel =
    onlyType === "label" && selected.length === 1 ? (selected[0] as Label) : undefined;

  return (
    <aside
      className={panel({ side: "left" })}
      aria-label="Tool options"
      /**
       * **What is selected, by type** — the same trick `data-land-count` plays two blocks down,
       * and for the reason `07` §1 gives: "N selected" cannot tell a channel from the continent
       * it is cut through, so an assertion about *which* one a click picked could be satisfied
       * by the wrong answer. WP-41 needs exactly that distinction, since water lies inside the
       * land's outline and the whole question is which of the two wins the press.
       */
      data-selection-types={[...new Set(selected.map((object) => object.type))].sort().join(",")}
    >
      <p className={panelTitle()}>Tool options · {activeLayerId}</p>

      {/*
        A single-tool layer gets no chips: a segmented control with one segment is a label
        pretending to be a control, and clicking it cannot change anything. Icons and labels
        each offer exactly one way to create, and the toolbar already says which layer you are
        on.
      */}
      {tools && tools.length > 1 && !globalMode && (
        <div className={segment()}>
          {tools.map((tool) => (
            <button
              key={tool}
              type="button"
              data-mode={tool}
              className={toolButton({ active: objectTool === tool })}
              onClick={() => setObjectTool(tool)}
            >
              {TOOL_LABEL[tool]}
            </button>
          ))}
        </div>
      )}

      {/*
        WP-33 — how big the next one lands. A **multiplier** of the kind's art height, not map
        units: drawn height is `SPRITE_HEIGHT[kind] × scale`, so an absolute control would have
        to divide by the art constant and would change meaning whenever the art is retuned.
        Labels are absent because they already have a size in map units of their own.

        It sets the *next* placement and does not touch a selection. The label-size slider does
        edit its selected label, but the analogy breaks here: a label selection is one object
        with one size, while a sprite selection is dozens with deliberately different ones, and
        "set them all to 150%" would flatten the very jitter scatter exists to create. Resizing
        what is already placed is the frame's handles, which do it per object.
      */}
      {spriteKind &&
        spriteKind !== "label" &&
        (objectTool === "scatter" || objectTool === "place") && (
          <Slider
            label="Size"
            value={spriteScale[spriteKind]}
            min={0.25}
            max={3}
            step={0.05}
            display={`${Math.round(spriteScale[spriteKind] * 100)}%`}
            onChange={(value) => setSpriteScale(spriteKind, value)}
          />
        )}

      {/*
        WP-35 — how much room the brush leaves between siblings, as a fraction of what they are
        drawn at. Scatter only: `place` is a deliberate gesture and must never be silently
        refused, which is the same rule that lets the frame's handles overrule the size knob.

        The display says what it *means* rather than what it is — "0.58× height" is the number,
        "no crowding" is the promise, and **off** is a real value rather than a second control.
      */}
      {spriteKind && spriteKind !== "label" && objectTool === "scatter" && (
        <Slider
          label="Spacing"
          value={spriteSpacing[spriteKind]}
          min={0}
          max={1.5}
          step={0.02}
          display={
            spriteSpacing[spriteKind] === 0
              ? "off"
              : `${spriteSpacing[spriteKind].toFixed(2)}× high`
          }
          hint="How close two may stand, measured against their own drawn height. Off lets them pile up, which is how the brush behaved before."
          onChange={(value) => setSpriteSpacing(spriteKind, value)}
        />
      )}

      {/*
        WP-27 — this was `jitter(5)` hardcoded in `anchorAt`, so the only way to find out how
        much a scatter turned things was to scatter some. It is a *spread*, not an angle, and
        it defaults to 0: upright is what "no rotation" should mean, and a stylised map often
        wants exactly that. The generator keeps its own (`12` D4), in the generate dialog.

        Gated on `spriteKind`, like Size and Spacing above, and not on the tool alone: terrain
        has no `objectTool` of its own, so it keeps whichever one was last in hand — usually
        `scatter` — and the rail was offering a rotation knob to a brush that paints polygons.
      */}
      {spriteKind && spriteKind !== "label" && objectTool === "scatter" && (
        <Slider
          label="Rotation jitter"
          value={scatterRotation}
          min={0}
          max={45}
          step={1}
          display={scatterRotation === 0 ? "upright" : `±${scatterRotation}°`}
          onChange={setScatterRotation}
        />
      )}

      {onTerrain && !globalMode && (
        <>
          <Slider
            label="Coast detail"
            value={scene.settings.coastDetail}
            min={0}
            max={1}
            step={0.05}
            display={scene.settings.coastDetail.toFixed(2)}
            hint="Smooth and stylised ↔ rough and natural."
            onChange={(coastDetail) =>
              record("coast detail", () => setSettings({ coastDetail }), true)
            }
          />
          {/* Hidden and locked both refuse the brush, so the rail says which — otherwise the
              stroke simply does nothing and there is nothing on screen explaining why. */}
          <p className={hint()}>
            {!terrainEditable
              ? `The terrain layer is ${terrainLayer?.visible ? "locked" : "hidden"} — nothing will paint until you ${terrainLayer?.visible ? "unlock" : "show"} it.`
              : "Drag to paint land. Overlapping strokes merge into one coastline. To take land away, use Water › Sea."}
          </p>
        </>
      )}

      {/*
        Biome is what the *land* brush paints and what a land selection is recoloured to. The
        sea brush removes land, so it has no biome to choose, and the eraser removes objects,
        so it has none either — a control that cannot act on the tool in your hand is exactly
        what I4 exists to prevent.
      */}
      {((paintingLand && !globalMode) || (selecting && selectedLand.length > 0)) && (
        <>
          <p className={panelTitle()} data-land-count={selectedLand.length}>
            {selectedLand.length > 0
              ? `${selectedLand.length} landmass${selectedLand.length === 1 ? "" : "es"}`
              : "Biome to paint"}
          </p>
          <div className={segment()}>
            {(Object.keys(BIOME_FILL) as Biome[]).map((biome) => (
              <button
                key={biome}
                type="button"
                data-biome={biome}
                className={toolButton({
                  active:
                    selectedLand.length > 0
                      ? selectedLand.every((l) => l.biome === biome)
                      : terrainBiome === biome,
                })}
                onClick={() => pickBiome(biome)}
              >
                <span
                  aria-hidden
                  className="mbf:border-line mbf:size-3 mbf:rounded-full mbf:border"
                  style={{ background: BIOME_FILL[biome] }}
                />
                {biome}
              </button>
            ))}
          </div>
          {/*
            A field, not a dialog. Unlike a label — whose whole point is *where* it sits, so
            it gets an editor on the canvas — a landmass name is metadata about the selected
            thing, which is what a properties strip is for. And WP-13's acceptance forbids
            reaching for a native text prompt again.
          */}
          {selectedLand.length === 1 && (
            <label className={field()}>
              <span className={fieldLabel()}>Name</span>
              <input
                key={selectedLand[0].id}
                data-land-name
                defaultValue={selectedLand[0].name ?? ""}
                placeholder="Unnamed"
                className="mbf:bg-sink mbf:border-line mbf:text-ink mbf:focus-visible:outline-accent mbf:w-full mbf:rounded-md mbf:border mbf:px-2 mbf:py-1 mbf:text-xs mbf:focus-visible:outline-2"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name === (selectedLand[0].name ?? "")) return;
                  record("name landmass", () =>
                    patchObject<Landmass>("terrain", selectedLand[0].id, { name }),
                  );
                }}
              />
            </label>
          )}
        </>
      )}

      {/*
        With **either substance** selected since WP-41's follow-up: the policy is read at
        **drop** time, when a dragged path object lands on another (ADR-25), and water drops on
        water in exactly the way land drops on land. A brush stroke cannot trigger it —
        overlapping strokes union — so it only ever belongs beside a selection.

        `carve` is offered only for land. A landmass biting a channel through another is a
        picture; water carving water is not a thing that can happen, since two overlapping
        water bodies are one body (D10). A control that cannot act is what I9 exists to prevent.
      */}
      {selecting && selectedPaths.length > 0 && (
        <>
          <p className={panelTitle()}>On overlap</p>
          <div className={segment()}>
            {(selectedLand.length > 0
              ? (["apart", "merge", "carve"] as const)
              : (["apart", "merge"] as const)
            ).map((policy) => (
              <button
                key={policy}
                type="button"
                data-overlap={policy}
                className={toolButton({ active: overlapPolicy === policy })}
                onClick={() => setOverlapPolicy(policy)}
              >
                {policy === "apart" ? "keep apart" : policy}
              </button>
            ))}
          </div>
          {/*
            Read at drop time, never asked as a modal: a dialog appears *after* the press,
            so the pointer could not promise the outcome (C6), and it would fire again on
            every nudge. "Carve a strait" is the third outcome and arrives with WP-17 — it
            is absent rather than disabled, because a control that does nothing is the thing
            I9 exists to prevent.
          */}
          <p className={hint()}>
            {overlapPolicy === "apart"
              ? selectedLand.length > 0
                ? "A drop that lands on other land slides back along the drag to where it last fit."
                : "A drop that lands on other water slides back to where the drag began."
              : overlapPolicy === "merge"
                ? "A drop that lands on its own kind fuses with it — the larger piece keeps its id."
                : "A drop that lands on other land bites a channel through itself. If that would leave almost nothing, it slides back instead."}
          </p>
        </>
      )}

      {activeLayerId === "icons" && objectTool === "place" && (
        <div className={segment()}>
          {ICON_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={toolButton({ active: iconKind === kind })}
              onClick={() => setIconKind(kind)}
            >
              {kind}
            </button>
          ))}
        </div>
      )}

      {/*
        Two honest cases and no third: placing on the labels layer sets the *next* label's
        size, and exactly one selected label resizes *that* label. It used to show for any
        all-label selection, where `editingLabel` is undefined for two or more — so the slider
        said it was editing the selection and silently moved the default instead.
      */}
      {((activeLayerId === "labels" && objectTool === "place") || editingLabel) && (
        <>
          <Slider
            label="Text size"
            value={editingLabel?.size ?? labelSize}
            min={24}
            max={220}
            step={4}
            onChange={(size) => {
              if (editingLabel)
                record(
                  "resize label",
                  () => patchObject<Label>("labels", editingLabel.id, { size }),
                  true,
                );
              else setLabelSize(size);
            }}
          />
          {editingLabel && (
            <button
              type="button"
              className={button({ block: true })}
              onClick={() => onEditLabel(editingLabel)}
            >
              Rename “{editingLabel.text}”
            </button>
          )}
        </>
      )}

      {/*
        WP-41 — one brush, two modes (`16` D4), and the chips are where the mode is chosen.

        They are a real segmented control rather than two toolbar buttons because the two are
        **mutually exclusive readings of the same gesture**: both drag a disc across the map and
        both leave water behind. What separates them is what happens to the land — carve removes
        it, lay does not — and D6 makes that visible in the result, since only carved sea bands.
        So the rail says which mode, the ring says it again before the press (C6), and the map
        says it a third time afterwards.
      */}
      {onWater && !globalMode && (
        <>
          {/*
            **Two tabs, then the modes inside one of them.** Three flat chips said the layer had
            three peer tools; it has two *substances to make* — sea, by taking land away, and
            rivers, by putting water in — and rivers happen to be authorable two ways.

            The nesting is the honest shape: Sea has nothing under it because carving is one
            gesture, and a segmented control with one segment is a label pretending to be a
            control. River has two, because a brush and a spline are genuinely different ways to
            draw the same object (C9 — they are indistinguishable once committed).
          */}
          <div className={segment()}>
            {(["sea", "river"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                data-water-tab={tab}
                className={toolButton({ active: waterTab === tab })}
                onClick={() => setWaterTool(tab === "sea" ? "carve" : "lay")}
              >
                {tab === "sea" ? "Sea" : "River"}
              </button>
            ))}
          </div>
          {waterTab === "river" && (
            <div className={segment()}>
              {(["lay", "spline"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-mode={mode}
                  className={toolButton({ active: waterTool === mode })}
                  onClick={() => setWaterTool(mode)}
                >
                  {mode === "lay" ? "Brush" : "Draw with Spline"}
                </button>
              ))}
            </div>
          )}
          {/*
            **Brush size above the detail slider, and below the modes.** It is the least specific
            thing about the tool — every brush has one — so it belongs under the choice of tool
            and over the setting that shapes what the stroke leaves behind.
          */}
          {waterTool !== "spline" && (
            <Slider
              label="Brush size"
              value={brushSize}
              min={40}
              max={800}
              step={10}
              display={`${brushSize} px`}
              onChange={setBrushSize}
            />
          )}
          {/*
            WP-43's two tool settings, and they are **tool settings** in the strictest sense
            (D8): they shape the geometry at creation and are then gone, exactly as brush size
            is gone. Nothing about them is written to the object, which is what keeps a
            spline-drawn river indistinguishable from a brushed one afterwards (C9) — and is
            why there is no Reroll to put beside them (D17). The way back from a river you
            dislike is undo and draw again.
          */}
          {waterTool === "spline" && (
            <>
              {/*
                Two bounds rather than one width, because the width is **randomised**: a single
                number was a value the river mostly was not, and the range it could actually
                reach was implicit. These say what they mean, and the preview promises the
                **maximum** as the envelope the river will fit inside.
              */}
              <Slider
                label="Narrowest"
                value={splineMinWidth}
                min={4}
                max={140}
                step={2}
                display={`${splineMinWidth} px`}
                onChange={(min) => setSpline({ min })}
              />
              <Slider
                label="Widest"
                value={splineMaxWidth}
                min={4}
                max={140}
                step={2}
                display={`${splineMaxWidth} px`}
                hint="The preview draws this width, so the river can only ever come out narrower than what you saw."
                onChange={(max) => setSpline({ max })}
              />
              <Slider
                label="Bank roughness"
                value={splineRoughness}
                min={0}
                max={1}
                step={0.05}
                display={splineRoughness.toFixed(2)}
                hint="Wobbles each bank on its own, so the two are not mirror images. Never a taper — a river may be widest in the middle."
                onChange={(roughness) => setSpline({ roughness })}
              />
            </>
          )}
          {/*
            The same `settings.coastDetail` the terrain layer calls **Coast detail**, named for
            what it does *here*: a bank is coastline, so this is the setting that decides whether
            one comes out smooth or ragged. One value, two honest names — the alternative is a
            control labelled for a layer you are not on.

            ponytail: the spline's own **Bank roughness** is a different value under the same
            name — a *tool* setting, session-only, against this *scene* setting which is
            persisted and undoable. They are never on screen together, so the collision is
            invisible in use; if the two modes are ever shown side by side, one has to be renamed.
          */}
          {waterTool !== "spline" && (
            <Slider
              label="Bank roughness"
              value={scene.settings.coastDetail}
              min={0}
              max={1}
              step={0.05}
              display={scene.settings.coastDetail.toFixed(2)}
              hint="Smooth and stylised ↔ rough and natural. A bank is coastline, so this shapes the whole map's."
              onChange={(coastDetail) =>
                record("coast detail", () => setSettings({ coastDetail }), true)
              }
            />
          )}
          {/* Hidden and locked both refuse the brush, so the rail says which — otherwise the
              stroke simply does nothing and there is nothing on screen explaining why. Carve
              needs *terrain* editable as well, because it is the land it removes. */}
          <p className={hint()}>
            {!waterEditable
              ? `The water layer is ${waterLayer?.visible ? "locked" : "hidden"} — nothing will draw until you ${waterLayer?.visible ? "unlock" : "show"} it.`
              : waterTool === "carve" && !terrainEditable
                ? `Carving removes land, and the terrain layer is ${terrainLayer?.visible ? "locked" : "hidden"} — nothing will carve until you ${terrainLayer?.visible ? "unlock" : "show"} it.`
                : waterTool === "carve"
                  ? "Carve removes land, and the sea that fills the gap takes coastal bands."
                  : waterTool === "spline"
                    ? "Click to lay the river’s course, then double-click or press Enter to finish. The preview is the river you will get; only its banks are decided on commit, so the same course drawn twice gives two different rivers."
                    : "Drag to lay a river or lake. It cuts a channel through the land, and channels take no bands. Overlapping strokes merge into one."}
          </p>
        </>
      )}

      {/*
        **Last in the group, not first.** Brush size is the least specific thing about the tool
        in hand — every brush has one — so it reads as a footnote to the mode and the biome
        rather than as the headline, and putting it on top pushed the controls that actually
        distinguish one brush from another below the fold.

        The eraser is global since WP-26, so its size has to be reachable from any layer. The
        **water layer renders its own** above its detail slider, because its modes sit in tabs
        and the size belongs under the mode it applies to; the spline has its own widths, so the
        disc's size would be a control that cannot act on the tool in hand — what I4 prevents.
      */}
      {(erasing || (!selecting && (onTerrain || (isObjectLayer && objectTool === "scatter")))) && (
        <Slider
          label="Brush size"
          value={brushSize}
          min={40}
          max={800}
          step={10}
          display={`${brushSize} px`}
          onChange={setBrushSize}
        />
      )}

      {selecting && (
        <>
          {/*
            Say only what is true of what is actually selected (I4). The land-only branch
            used to offer nothing but recolour and rename, which was honest while terrain
            could not be dragged — WP-15, WP-16 and WP-20 made move, scale and rotate real
            for both path types, so every framed selection now gets the same first line and
            each type adds only what is extra about it.
          */}
          <p className={hint()}>
            {selected.length === 0
              ? "Click, shift-click or drag a marquee to select — any layer, not just this one."
              : `${selected.length} selected${onlyType ? "" : " across types"}` +
                " · drag to move · corners scale · the stalk rotates." +
                (selectedLand.length > 0
                  ? " Double-click land to take what stands on it too."
                  : "")}
          </p>
          {/*
            Absent, not disabled, for a land-only selection: landmasses never overlap at
            rest (`08` C1), so draw order among them cannot mean anything. A control that
            appears and does nothing is exactly what I9 exists to prevent.
          */}
          {transformable && (
            <div className={segment()}>
              <button
                type="button"
                className={button()}
                disabled={selected.length === 0}
                onClick={() => restackSelection(1)}
              >
                <ChevronsUp size={13} /> Forward
              </button>
              <button
                type="button"
                className={button()}
                disabled={selected.length === 0}
                onClick={() => restackSelection(-1)}
              >
                <ChevronsDown size={13} /> Back
              </button>
            </div>
          )}
          <button
            type="button"
            className={button({ tone: "danger", block: true })}
            disabled={selected.length === 0}
            onClick={deleteSelection}
          >
            <Trash2 size={13} /> Delete selected
          </button>
        </>
      )}
    </aside>
  );
}
