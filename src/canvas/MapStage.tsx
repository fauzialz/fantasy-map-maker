import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Line, Stage } from "react-konva";
import { LAYER_OBJECT, selectLandmasses, useEditorStore } from "../state/editorStore";
import { useThemeStore } from "../state/themeStore";
import { LAYER_ORDER, type Label, type LayerId, type Point } from "../scene/types";
import { LabelEditor } from "../ui/LabelEditor";
import { statusBar } from "../ui/variants";
import { BackgroundLayer } from "./BackgroundLayer";
import { BrushRing, type BrushTone } from "./BrushRing";
import { RingsLayer } from "./RingsLayer";
import { VignetteLayer } from "./VignetteLayer";
import { SemanticLayer } from "./SemanticLayer";
import { useDerivedTerrain } from "./useDerivedTerrain";
import { PALETTE } from "./palette";
import { SelectionOverlay } from "./SelectionOverlay";
import { TerrainSelectionOverlay } from "./TerrainSelectionOverlay";
import { createLabel, useObjectBrush } from "./useObjectBrush";
import { useSelection } from "./useSelection";
import { useTerrainBrush } from "./useTerrainBrush";
import {
  clampPan,
  centred,
  clampViewport,
  fitScale,
  padRect,
  rectContains,
  visibleRect,
  zoomAt,
  ZOOM_STEP,
  type Rect,
  type Size,
  type Viewport,
} from "./viewport";

/** Extra margin cached around the visible rect so small pans don't force a re-cache. */
/**
 * How much beyond the viewport each cached bitmap covers, as a fraction of the viewport.
 *
 * **0.25 → 0.5 for the pan hitch.** Panning does not change the scale, so the only thing that
 * re-caches mid-drag is the view leaving this padded region — and when it does, five layers
 * re-render in one frame: measured at **500 ms** on a 1 096-object world. Doubling the pad
 * doubles how far a drag travels before that happens; the bitmaps grow from (1.5)² to (2)² of
 * the viewport, which is 1.8× the memory ADR-19 budgets and still tens of MB rather than the
 * ~290 MB full-map caching would cost.
 */
const CACHE_PAD = 0.5;

/** An open inline label editor: where it sits, and which label it is rewriting (if any). */
interface LabelDraft {
  at: Point;
  screen: { x: number; y: number };
  id?: string;
  text: string;
}

export function MapStage({ editing }: { editing?: Label }) {
  const scene = useEditorStore((s) => s.scene);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const map = useMemo<Size>(
    () => ({ w: scene.meta.canvas.w, h: scene.meta.canvas.h }),
    [scene.meta.canvas.w, scene.meta.canvas.h],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Size | null>(null);
  const [vp, setVp] = useState<Viewport | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [bytes, setBytes] = useState<Partial<Record<LayerId, number>>>({});
  const [cursor, setCursor] = useState<Point | null>(null);
  /**
   * Suppresses the brush ring while the wheel is turning. `zoomAt` pins the map point under
   * the pointer, so the ring is *usually* still truthful — but at the pan clamp that pinning
   * gives way, and the ring drifts off the cursor for as long as the zoom keeps hitting the
   * edge. A ring that promises where a press will land cannot be allowed to point somewhere
   * else (I4), and a ring resizing under a still cursor reads as noise either way.
   */
  const [zooming, setZooming] = useState(false);
  const zoomIdle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /**
   * Where the pointer physically is, in client coordinates.
   *
   * `cursor` is a *map* point and only a mousemove produces one — so after a zoom the pointer
   * has not moved but the map under it has, and the stored point is stale by however much the
   * pan clamp shifted things. That is a stale ring **and** a stale `x · y` readout. Keeping
   * the screen position lets both be recomputed the moment the zoom settles.
   */
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<LabelDraft | null>(null);

  /**
   * Rebuilds every Konva node when the drawn colours change (ADR-24). A theme flip
   * refreshes `PALETTE` in place and drops the texture and sprite caches, but the nodes
   * already on the stage were built from the old values, so they have to be rebuilt.
   * The viewport survives because it is state *here*, not inside the stage.
   *
   * ponytail: a whole-stage remount, not a per-layer colour dependency threaded through
   * six components. Measured at **190 ms** click-to-painted-frame on a generated world of
   * 1 085 objects at fit zoom — a visible hitch, but this fires when someone changes theme
   * and at no other time. If it ever fires often, the upgrade is invalidating only the
   * layers whose colours actually moved (see DEBT Q-01, which wants the same split).
   */
  const themeRevision = useThemeStore((s) => s.revision);

  // Mirror of the viewport, so screen→map conversion stays a stable callback.
  const vpRef = useRef<Viewport | null>(null);
  vpRef.current = vp;

  // Measure the container; the stage is viewport-sized, never map-sized.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setView({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit on first measure, and re-clamp whenever the viewport or the map changes.
  useEffect(() => {
    if (!view) return;
    setVp((prev) => clampViewport(prev ?? centred(fitScale(map, view), map, view), map, view));
  }, [view, map]);

  // Reset to a fitted view when the scene (and so the canvas preset) changes.
  useEffect(() => {
    if (view) setVp(clampViewport(centred(fitScale(map, view), map, view), map, view));
  }, [scene.meta.id, map, view]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === "Space" && setSpaceHeld(true);
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const toMapPoint = useCallback((clientX: number, clientY: number): Point => {
    const box = containerRef.current?.getBoundingClientRect();
    const current = vpRef.current;
    if (!box || !current) return [0, 0];
    return [
      (clientX - box.left - current.x) / current.scale,
      (clientY - box.top - current.y) / current.scale,
    ];
  }, []);

  // Wheel needs a non-passive native listener to preventDefault the page scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!view) return;
      const box = el.getBoundingClientRect();
      const pointer = { x: e.clientX - box.left, y: e.clientY - box.top };
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setVp((prev) => (prev ? zoomAt(prev, pointer, factor, map, view) : prev));
      // A wheel gesture is a burst of events with no end of its own, so the ring comes back
      // on an idle timer — or sooner, the moment the pointer moves and is truthful again.
      setZooming(true);
      clearTimeout(zoomIdle.current);
      zoomIdle.current = setTimeout(() => {
        // Re-derive the map point under the pointer *after* the last zoom has rendered —
        // `vpRef` is assigned during render, so by now it is the viewport the ring will be
        // drawn against. Without this the ring reappears wherever the cursor used to be.
        if (pointerRef.current) setCursor(toMapPoint(pointerRef.current.x, pointerRef.current.y));
        setZooming(false);
      }, 250);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      clearTimeout(zoomIdle.current);
    };
  }, [map, toMapPoint, view]);

  /** Map space → a position inside the stage container, for DOM overlaid on the canvas. */
  const toScreen = useCallback(([x, y]: Point) => {
    const current = vpRef.current;
    return current
      ? { x: x * current.scale + current.x, y: y * current.scale + current.y }
      : { x: 0, y: 0 };
  }, []);

  const openLabelDraft = useCallback(
    (at: Point, label?: Label) =>
      setDraft({ at, screen: toScreen(at), id: label?.id, text: label?.text ?? "" }),
    [toScreen],
  );

  // The rail's rename button reaches the same editor, so there is one way to type a name.
  useEffect(() => {
    if (editing) openLabelDraft([editing.x, editing.y], editing);
  }, [editing, openLabelDraft]);

  const brushSize = useEditorStore((s) => s.brushSize);
  const terrainTool = useEditorStore((s) => s.terrainTool);
  /**
   * Ring derivation costs 119–488 ms against a 16 ms frame (C2), so it cannot track a
   * drag. Declared before the hooks that need it and filled in by the selection below —
   * the alternative is a drag that queues a derivation per mousemove and saturates the
   * worker for its whole length.
   */
  const [movingLand, setMovingLand] = useState(false);
  const derived = useDerivedTerrain(map, movingLand);
  /** A locked layer accepts no *creation* tool — that is what the lock means for making. */
  const unlocked = !scene.layers.find((l) => l.id === activeLayerId)?.locked;
  const ready = !spaceHeld && !draft;
  const live = unlocked && ready;
  const objectTool = useEditorStore((s) => s.objectTool);
  const onObjectLayer = LAYER_OBJECT[activeLayerId] !== undefined;
  /**
   * Selecting is a mode, not a capability of the active layer (ADR-28). It is live on every
   * layer including terrain — where it selects the sprites and labels standing on the land —
   * so the layer's own creation tool has to stand down while it is on.
   */
  const selecting = objectTool === "select";
  /**
   * WP-26 — Erase is the second global mode (ADR-37), so it reads like `selecting`: it is
   * live on every layer, the layer's own creation tool stands down while it is on, and the
   * **active layer's lock does not gate it** — `eraseAt` skips locked and hidden layers
   * itself, which is the same arrangement selection already uses.
   */
  const erasing = objectTool === "erase";
  /**
   * The terrain layer's own flags, which are what gate the land and sea brushes — not the
   * active layer's, even though the two coincide today. Hidden counts as well as locked:
   * `12` D3's rule is that hiding a layer protects it, and painting into a layer you cannot
   * see is the same silent edit a locked one refuses.
   */
  const terrainLayer = scene.layers.find((layer) => layer.id === "terrain");
  const terrainEditable = !!terrainLayer?.visible && !terrainLayer.locked;
  const brush = useTerrainBrush({
    enabled: activeLayerId === "terrain" && !selecting && !erasing && ready && terrainEditable,
    map,
    toMapPoint,
  });
  const objects = useObjectBrush({
    activeLayerId,
    enabled: erasing ? ready : onObjectLayer && !selecting && live,
    toMapPoint,
    onPlaceLabel: openLabelDraft,
  });
  // Not gated on the active layer's lock: selecting does not edit the active layer, and the
  // pool already drops every locked layer, so a lock still scopes what can be picked.
  const selection = useSelection({
    enabled: selecting && ready,
    scale: vp?.scale ?? 1,
    toMapPoint,
  });
  useEffect(() => setMovingLand(selection.movingLand), [selection.movingLand]);

  // Pan: middle-drag, or space + left-drag. Plain left-drag paints.
  const dragRef = useRef<{ x: number; y: number; vp: Viewport } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    if (!vp) return;
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      dragRef.current = { x: e.clientX, y: e.clientY, vp };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    if (
      brush.begin(e.clientX, e.clientY) ||
      objects.begin(e.clientX, e.clientY) ||
      selection.begin(e.clientX, e.clientY, e.shiftKey)
    )
      e.preventDefault();
  };
  useEffect(() => {
    if (!panning || !view) return;
    const move = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setVp(
        clampPan(
          { ...drag.vp, x: drag.vp.x + (e.clientX - drag.x), y: drag.vp.y + (e.clientY - drag.y) },
          map,
          view,
        ),
      );
    };
    const stop = () => {
      dragRef.current = null;
      setPanning(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
  }, [panning, map, view]);

  /**
   * The cache rect only changes when the zoom changes or the view pans out of the
   * padded region — so cached layers re-render rarely, and each cached bitmap covers
   * the viewport rather than the whole map.
   *
   * **Except while the wheel is turning.** Re-caching is five viewport-sized renders over
   * every object on the map, and keying it on the exact scale meant paying that *per wheel
   * step*: measured on a 1 096-object world, a twelve-step zoom held a 16.7 ms median but
   * spiked to **100 ms zooming in and 183 ms out**. During the gesture the bitmaps are simply
   * drawn at the wrong resolution — Konva scales them, so it goes soft rather than wrong — and
   * the one re-cache that sharpens it happens when the zoom settles, on the same idle the
   * brush ring already waits for.
   *
   * **Containment still forces a re-cache even mid-zoom**, and that part is not optional: a
   * zoom-out grows the visible rect, and a bitmap that no longer covers it would leave the map
   * beyond its edge simply missing rather than blurred.
   */
  const cacheRef = useRef<{ rect: Rect; scale: number } | null>(null);
  const cache = useMemo(() => {
    if (!vp || !view) return null;
    const vis = visibleRect(vp, view);
    const current = cacheRef.current;
    const resolutionStale = zooming && current !== null;
    if (
      !current ||
      (!resolutionStale && current.scale !== vp.scale) ||
      !rectContains(current.rect, vis)
    ) {
      cacheRef.current = { rect: padRect(vis, CACHE_PAD, map), scale: vp.scale };
    }
    return cacheRef.current;
  }, [vp, view, map, zooming]);

  /**
   * ADR-19 says the active layer is live and the rest are bitmaps — but a cross-layer drag
   * writes into layers that are not active, and a cached layer whose contents changed has
   * to re-cache: a viewport-sized render per layer, per frame. So holding part of the
   * selection makes a layer live too. Note the direction of the trade: a live layer holds
   * no bitmap at all, so this spends draw time and *saves* memory, and the ~1-2k budget is
   * on total objects rather than per layer.
   *
   * ponytail: measured (4000×3000 landscape, generated world, fit zoom, headless Chrome at
   * dpr 1) as median time from a dispatched mousemove to two frames later. The harness
   * itself — CDP round-trip plus the two rAFs — is **62 ms** of that, so subtract it:
   * 756 objects in one layer cost **~6 ms**, 957 across four cost **~23 ms**. Over a 16 ms
   * budget, under anything that feels broken, and far cheaper than the re-cache it avoids.
   * If a selection ever spans enough to matter, the upgrade is redrawing only the dirty
   * rect rather than the whole layer.
   */
  const selectionIds = useEditorStore((s) => s.selection);
  const liveLayers = useMemo(() => {
    const ids = new Set(selectionIds);
    return new Set(
      scene.layers
        .filter((layer) => layer.objects.some((object) => ids.has(object.id)))
        .map((layer) => layer.id),
    );
  }, [scene.layers, selectionIds]);

  const onCacheBytes = useCallback((id: LayerId, value: number) => {
    setBytes((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);
  const [ringBytes, setRingBytes] = useState(0);
  const onRingBytes = useCallback((value: number) => setRingBytes(value), []);

  const landCount = useEditorStore(selectLandmasses).length;
  const undoDepth = useEditorStore((s) => s.past.length);
  const objectCount = scene.layers.reduce(
    (total, layer) => total + (layer.id === "terrain" ? 0 : layer.objects.length),
    0,
  );
  const totalBytes = Object.values(bytes).reduce((a, b) => a + b, 0) + ringBytes;
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  /**
   * WP-24 — which brush-shaped tool is in hand, if any (`12` §1).
   *
   * `place` and `select` are absent because neither has a radius: one makes a single object
   * at a click, and the other's hit shape *is* the pointer, which I4 already governs through
   * the cursor. A **locked** layer is absent for the same reason the cursor reads
   * `not-allowed` there — a ring is a promise that a press will paint, and on a locked layer
   * it would be a lie. Panning is absent because the press belongs to the pan, not the brush.
   */
  const brushTone: BrushTone | null =
    !cursor || selecting || panning || spaceHeld || zooming
      ? null
      : erasing
        ? "erase" // global since WP-26, so it shows on terrain and rivers too, lock or not
        : activeLayerId === "terrain"
          ? // Terrain answers to its own flags, hidden included — a ring over a layer that
            // will not take the paint is the lie I4 exists to prevent.
            terrainEditable
            ? terrainTool === "sea"
              ? "sea"
              : "paint"
            : null
          : !unlocked
            ? null
            : objectTool === "scatter"
              ? "paint"
              : null;

  /**
   * Panning and the space-drag override everything; otherwise whichever tool owns the layer
   * supplies its own handle-aware cursor, and a painting tool falls back to a crosshair.
   * Same precedence as `onMouseDown`, so the pointer promises what a press does (I4).
   *
   * **The fallback has to know Select is on.** A create tool's crosshair is the cursor for
   * "a press here makes something", and while Select is the mode a press on empty space
   * starts a marquee instead — so offering a crosshair there is the pointer lying about the
   * gesture, one layer above the ladder rather than inside it. Shipped in WP-18 and found by
   * WP-20's driver, which read `crosshair` where it expected the marquee cursor.
   */
  const pointerCursor = panning
    ? "grabbing"
    : spaceHeld
      ? "grab"
      : !unlocked && !selecting && !erasing
        ? "not-allowed"
        : (selection.cursor ??
          // The eraser is global, so it promises a crosshair on every layer — including
          // water, which creates nothing through the object brush (I4).
          (erasing || (!selecting && (activeLayerId === "terrain" || LAYER_OBJECT[activeLayerId]))
            ? "crosshair"
            : "default"));

  /** The live, uncached layer draws whatever the active tool is in the middle of. */
  /**
   * The one overlay that belongs *inside* a layer: the terrain brush preview is pretending
   * to be land, so it has to sit under the forests and mountains standing on that land.
   * Selection and river chrome go above everything instead — see the overlay layer below.
   */
  const overlayFor = (id: LayerId) => {
    if (id !== activeLayerId) return undefined;
    if (id === "terrain" && brush.previewPoints)
      return (
        <Line
          points={brush.previewPoints}
          // the sea brush previews as water, so erasing reads as erasing
          stroke={terrainTool === "sea" ? PALETTE.seaDeep : PALETTE.paper}
          strokeWidth={brushSize}
          lineCap="round"
          lineJoin="round"
          opacity={0.75}
        />
      );
    return undefined;
  };

  const commitDraft = (text: string) => {
    const state = useEditorStore.getState();
    if (draft?.id) {
      const id = draft.id;
      state.record("rename label", () => state.patchObject<Label>("labels", id, { text }));
    } else if (draft) {
      state.record("place label", () => state.addObjects("labels", [createLabel(draft.at, text)]));
    }
    setDraft(null);
  };

  return (
    <div
      ref={containerRef}
      className="mbf-stage mbf:relative mbf:min-w-0 mbf:grow mbf:overflow-hidden"
      onMouseDown={onMouseDown}
      onMouseMove={(e) => {
        selection.hover(e.clientX, e.clientY);
        pointerRef.current = { x: e.clientX, y: e.clientY };
        setCursor(toMapPoint(e.clientX, e.clientY));
        setZooming(false);
      }}
      onMouseLeave={() => {
        pointerRef.current = null;
        setCursor(null);
      }}
      onDoubleClick={(e) => {
        // A double-click's first press has already selected the label under the pointer.
        const selected = useEditorStore.getState().selection;
        const label = scene.layers
          .find((l) => l.id === "labels")
          ?.objects.find((o) => o.id === selected[0] && o.type === "label") as Label | undefined;
        if (label) return openLabelDraft([label.x, label.y], label);
        // Otherwise: land under the pointer takes everything standing on it (WP-19).
        selection.expand(e.clientX, e.clientY);
      }}
      style={{ cursor: pointerCursor }}
    >
      {view && vp && cache && (
        <Stage
          key={themeRevision}
          width={view.w}
          height={view.h}
          scaleX={vp.scale}
          scaleY={vp.scale}
          x={vp.x}
          y={vp.y}
        >
          <BackgroundLayer map={map} parchment={scene.settings.parchment} />
          <RingsLayer
            bands={derived.bands}
            stale={derived.stale}
            cacheRect={cache.rect}
            cacheScale={cache.scale}
            onCacheBytes={onRingBytes}
          />
          {scene.layers.map((layer) => (
            <SemanticLayer
              key={layer.id}
              layer={layer}
              active={layer.id === activeLayerId || liveLayers.has(layer.id)}
              cacheRect={cache.rect}
              cacheScale={cache.scale}
              onCacheBytes={onCacheBytes}
              overlay={overlayFor(layer.id)}
              /*
                Terrain alone takes the derived land (WP-40). Every other layer draws its own
                objects, and the water layer draws nothing at all — the cut *is* its output.
              */
              land={layer.id === "terrain" ? derived.land : undefined}
              stale={layer.id === "terrain" && derived.landStale}
            />
          ))}
          {scene.settings.parchment && <VignetteLayer map={map} />}

          {/*
            Tool chrome, above every layer including the vignette.

            It used to render *inside* the active layer, which was survivable only while the
            selection and the active layer were the same thing. Once selection went global
            (WP-18) the frame could be drawn into `terrain` — the bottom of the stack — and
            buried under 890 trees. A frame you cannot see is the same defect as no frame.

            WP-40 removed the second overlay that lived here: a selected river drew its
            control points on top of the frame. Rivers have no control points now — a water
            body is an outline like a landmass — and node editing is deliberately unscheduled
            (`16` D3, §7), so the frame is once again the only chrome a path object draws.
          */}
          <Layer listening={false}>
            {selecting && (
              <>
                <TerrainSelectionOverlay landmasses={selection.landmasses} scale={vp.scale} />
                <SelectionOverlay
                  frame={selection.frame}
                  marquee={selection.marquee}
                  scale={vp.scale}
                />
              </>
            )}
            {brushTone && cursor && (
              // Radius, not diameter: the terrain preview strokes `brushSize` wide, and both
              // the scatter spread and the eraser's disc are `brushSize / 2`.
              <BrushRing at={cursor} radius={brushSize / 2} scale={vp.scale} tone={brushTone} />
            )}
          </Layer>
        </Stage>
      )}

      {draft && (
        <LabelEditor
          at={draft.screen}
          value={draft.text}
          onCommit={commitDraft}
          onCancel={() => setDraft(null)}
        />
      )}

      {/*
        Keeps the `hud` class and its counts: `07-interaction-invariants.md` §1 asks for a
        surface a driver can assert against, and every driver written so far reads this one.
      */}
      <p className={`hud ${statusBar()}`}>
        <span>zoom {vp ? Math.round(vp.scale * 100) : 0}%</span>
        <span>{cursor ? `x ${Math.round(cursor[0])} · y ${Math.round(cursor[1])}` : "—"}</span>
        <span>
          active <b className="mbf:text-ink">{activeLayerId}</b> (live) · {LAYER_ORDER.length - 1}{" "}
          cached = {mb(totalBytes)}
        </span>
        <span>
          {landCount} landmass{landCount === 1 ? "" : "es"}
        </span>
        {derived.bands.length > 0 && <span>{derived.bands.length} rings</span>}
        {objectCount > 0 && <span>{objectCount} objects</span>}
        {selection.count > 0 && <span>{selection.count} selected</span>}
        {undoDepth > 0 && <span>{undoDepth} undo</span>}
        {!unlocked && <span className="mbf:text-note">{activeLayerId} locked</span>}
        {brush.committing && <span>vectorising…</span>}
        {derived.stale && (
          <span className="mbf:text-note">terrain frozen — it follows on drop</span>
        )}
        {derived.deriving && <span>deriving terrain…</span>}
        {brush.error && <span className="mbf:text-danger">{brush.error}</span>}
        {derived.error && (
          <span className="mbf:text-danger">derivation failed: {derived.error}</span>
        )}
      </p>
    </div>
  );
}
