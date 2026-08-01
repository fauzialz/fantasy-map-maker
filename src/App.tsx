import { useEffect, useState } from "react";
import { MapStage } from "./canvas/MapStage";
import { callGeometry } from "./engine/worker/client";
import {
  download,
  exportFilename,
  planExport,
  renderScene,
  toBlob,
  type Format,
} from "./export/image";
import { useAutosave, type SaveStatus } from "./persistence/useAutosave";
import type { Label } from "./scene/types";
import { selectLandmasses, useEditorStore } from "./state/editorStore";
import { useToastStore } from "./state/toastStore";
import { TooltipProvider } from "./ui/controls";
import { ConfirmDialog, ExportDialog } from "./ui/dialogs";
import { MapPanel } from "./ui/MapPanel";
import { Toasts } from "./ui/Toasts";
import { Toolbar } from "./ui/Toolbar";
import { ToolOptions } from "./ui/ToolOptions";

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const SAVE_LABEL: Record<SaveStatus, string> = {
  loading: "opening your last map…",
  new: "saves as you work",
  restored: "restored your last map",
  saving: "saving…",
  saved: "saved",
  failed: "not saved",
};

/**
 * The shell: toolbar across the top, contextual tool options left, the map, and what the
 * map *is* on the right (`ux-wireframe.html`). It owns nothing but the two modals and the
 * two async actions they run — every control below reads and writes the store directly.
 */
export default function App() {
  const scene = useEditorStore((s) => s.scene);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const saveStatus = useAutosave();

  const [generating, setGenerating] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** The label the rail asked to rename; the stage opens its editor on it. */
  const [editingLabel, setEditingLabel] = useState<Label | undefined>();

  /**
   * 10h — generate the world in the worker, then apply the whole replace as one command.
   * Rings need no special handling: they are derived from the landmasses, so they follow.
   */
  const generate = async () => {
    setConfirmGenerate(false);
    setGenerating(true);
    try {
      const state = useEditorStore.getState();
      const result = await callGeometry("generate", {
        canvas: { w: state.scene.meta.canvas.w, h: state.scene.meta.canvas.h },
        ...state.scene.generator,
        seaLevel: state.seaLevel,
        mountainDensity: state.mountainDensity,
        forestDensity: state.forestDensity,
        coastDetail: state.scene.settings.coastDetail,
      });
      useEditorStore.getState().applyGenerated(result);
      useToastStore
        .getState()
        .show(
          `Generated ${result.landmasses.length} landmasses, ${result.mountains.length} mountains, ${result.trees.length} trees`,
          () => useEditorStore.getState().undo(),
        );
    } catch (err) {
      useToastStore.getState().show(`Generate failed: ${(err as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  /** Ask first only when there is something to lose (ADR-21). */
  const requestGenerate = () => {
    if (useEditorStore.getState().scene.layers.some((layer) => layer.objects.length > 0))
      setConfirmGenerate(true);
    else void generate();
  };

  /**
   * WP-11 — render the scene to its own canvas and hand it over as a file. Rings are
   * derived fresh rather than borrowed from the stage: they are never stored (ADR-13), and
   * one worker round-trip is cheaper than plumbing the stage's copy out to the dialog.
   */
  const exportImage = async (format: Format, requestedScale: number) => {
    setExporting(true);
    try {
      const state = useEditorStore.getState();
      const { canvas } = state.scene.meta;
      const plan = planExport(canvas, requestedScale);
      const landmasses = selectLandmasses(state);
      const bands =
        state.scene.settings.coastalRings && landmasses.length > 0
          ? (
              await callGeometry("deriveRings", {
                landmasses,
                canvas: { x: 0, y: 0, w: canvas.w, h: canvas.h },
                ringCount: state.scene.settings.ringCount,
                ringGap: state.scene.settings.ringGap,
              })
            ).bands
          : [];

      const filename = exportFilename(state.scene, format);
      const blob = await toBlob(renderScene(state.scene, bands, plan), format);
      download(blob, filename);
      setExportOpen(false);
      useToastStore
        .getState()
        .show(
          `Exported ${filename} · ${plan.w}×${plan.h} · ${fileSize(blob.size)}` +
            (plan.capped
              ? ` — ${requestedScale}× was capped to ${plan.scale.toFixed(2)}×, the export limit`
              : ""),
        );
    } catch (err) {
      useToastStore.getState().show(`Export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  // Undo has to answer wherever the pointer is, so it lives above the per-tool key handlers
  // rather than in any one of them.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  return (
    <TooltipProvider>
      <div className="mbf:flex mbf:h-full mbf:flex-col">
        <Toolbar onGenerate={requestGenerate} onExport={() => setExportOpen(true)} />

        <div className="mbf:flex mbf:min-h-0 mbf:grow">
          <ToolOptions onEditLabel={setEditingLabel} />
          <MapStage editing={editingLabel} />
          <MapPanel generating={generating} onGenerate={requestGenerate} />
        </div>

        <p
          data-autosave
          className="mbf:bg-panel mbf:border-line mbf:text-muted mbf:border-t mbf:px-3 mbf:py-1 mbf:text-[11px]"
        >
          {SAVE_LABEL[saveStatus]}
        </p>
      </div>

      <ConfirmDialog
        open={confirmGenerate}
        title="Generate a new map?"
        description="This replaces everything on the canvas. You can undo it in one step."
        confirmLabel="Replace map"
        onConfirm={() => void generate()}
        onOpenChange={setConfirmGenerate}
      />
      <ExportDialog
        open={exportOpen}
        canvas={scene.meta.canvas}
        busy={exporting}
        onExport={(format, scale) => void exportImage(format, scale)}
        onOpenChange={setExportOpen}
      />
      <Toasts />
    </TooltipProvider>
  );
}
