import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Line, Stage } from "react-konva";
import { selectLandmasses, useEditorStore } from "../state/editorStore";
import { LAYER_ORDER, type LayerId, type Point } from "../scene/types";
import { BackgroundLayer } from "./BackgroundLayer";
import { RingsLayer } from "./RingsLayer";
import { VignetteLayer } from "./VignetteLayer";
import { SemanticLayer } from "./SemanticLayer";
import { useCoastalRings } from "./useCoastalRings";
import { PALETTE } from "./palette";
import { SelectionOverlay } from "./SelectionOverlay";
import { LAYER_OBJECT, useObjectBrush } from "./useObjectBrush";
import { useSelection } from "./useSelection";
import { useTerrainBrush } from "./useTerrainBrush";
import {
  clampPan,
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
const CACHE_PAD = 0.25;

export function MapStage() {
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
    setVp((prev) => clampViewport(prev ?? { scale: fitScale(map, view), x: 0, y: 0 }, map, view));
  }, [view, map]);

  // Reset to a fitted view when the scene (and so the canvas preset) changes.
  useEffect(() => {
    if (view) setVp(clampViewport({ scale: fitScale(map, view), x: 0, y: 0 }, map, view));
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
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [map, view]);

  const toMapPoint = useCallback((clientX: number, clientY: number): Point => {
    const box = containerRef.current?.getBoundingClientRect();
    const current = vpRef.current;
    if (!box || !current) return [0, 0];
    return [
      (clientX - box.left - current.x) / current.scale,
      (clientY - box.top - current.y) / current.scale,
    ];
  }, []);

  const brushSize = useEditorStore((s) => s.brushSize);
  const terrainTool = useEditorStore((s) => s.terrainTool);
  const rings = useCoastalRings(map);
  const brush = useTerrainBrush({
    enabled: activeLayerId === "terrain" && !spaceHeld,
    map,
    toMapPoint,
  });
  const objectTool = useEditorStore((s) => s.objectTool);
  const onObjectLayer = LAYER_OBJECT[activeLayerId] !== undefined;
  const objects = useObjectBrush({
    activeLayerId,
    enabled: onObjectLayer && objectTool !== "select" && !spaceHeld,
    toMapPoint,
  });
  const selection = useSelection({
    activeLayerId,
    enabled: onObjectLayer && objectTool === "select" && !spaceHeld,
    scale: vp?.scale ?? 1,
    toMapPoint,
  });

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
   */
  const cacheRef = useRef<{ rect: Rect; scale: number } | null>(null);
  const cache = useMemo(() => {
    if (!vp || !view) return null;
    const vis = visibleRect(vp, view);
    const current = cacheRef.current;
    if (!current || current.scale !== vp.scale || !rectContains(current.rect, vis)) {
      cacheRef.current = { rect: padRect(vis, CACHE_PAD, map), scale: vp.scale };
    }
    return cacheRef.current;
  }, [vp, view, map]);

  const onCacheBytes = useCallback((id: LayerId, value: number) => {
    setBytes((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);
  const [ringBytes, setRingBytes] = useState(0);
  const onRingBytes = useCallback((value: number) => setRingBytes(value), []);

  const landCount = useEditorStore(selectLandmasses).length;
  const objectCount = scene.layers.reduce(
    (total, layer) => total + (layer.id === "terrain" ? 0 : layer.objects.length),
    0,
  );
  const totalBytes = Object.values(bytes).reduce((a, b) => a + b, 0) + ringBytes;
  const fullMapBytes = map.w * map.h * 4 * LAYER_ORDER.length;
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div
      ref={containerRef}
      className="stage"
      onMouseDown={onMouseDown}
      style={{
        cursor: panning
          ? "grabbing"
          : spaceHeld
            ? "grab"
            : activeLayerId === "terrain" || LAYER_OBJECT[activeLayerId]
              ? "crosshair"
              : "default",
      }}
    >
      {view && vp && cache && (
        <Stage width={view.w} height={view.h} scaleX={vp.scale} scaleY={vp.scale} x={vp.x} y={vp.y}>
          <BackgroundLayer map={map} parchment={scene.settings.parchment} />
          <RingsLayer
            bands={rings.bands}
            cacheRect={cache.rect}
            cacheScale={cache.scale}
            onCacheBytes={onRingBytes}
          />
          {scene.layers.map((layer) => (
            <SemanticLayer
              key={layer.id}
              layer={layer}
              active={layer.id === activeLayerId}
              cacheRect={cache.rect}
              cacheScale={cache.scale}
              onCacheBytes={onCacheBytes}
              overlay={
                layer.id === activeLayerId && onObjectLayer && objectTool === "select" ? (
                  <SelectionOverlay
                    bounds={selection.bounds}
                    marquee={selection.marquee}
                    scale={vp.scale}
                  />
                ) : layer.id === "terrain" && brush.previewPoints ? (
                  <Line
                    points={brush.previewPoints}
                    // the sea brush previews as water, so erasing reads as erasing
                    stroke={terrainTool === "sea" ? PALETTE.seaDeep : PALETTE.paper}
                    strokeWidth={brushSize}
                    lineCap="round"
                    lineJoin="round"
                    opacity={0.75}
                  />
                ) : undefined
              }
            />
          ))}
          {scene.settings.parchment && <VignetteLayer map={map} />}
        </Stage>
      )}
      <p className="hud">
        zoom {vp ? Math.round(vp.scale * 100) : 0}% · active <b>{activeLayerId}</b> (live) ·{" "}
        {LAYER_ORDER.length - 1} cached = {mb(totalBytes)} · full-map would be {mb(fullMapBytes)} ·{" "}
        {landCount} landmass{landCount === 1 ? "" : "es"}
        {rings.bands.length > 0 && ` · ${rings.bands.length} rings`}
        {objectCount > 0 && ` · ${objectCount} objects`}
        {selection.count > 0 && ` · ${selection.count} selected`}
        {brush.committing && " · vectorising…"}
        {rings.deriving && " · deriving rings…"}
        {brush.error && ` · ${brush.error}`}
      </p>
    </div>
  );
}
