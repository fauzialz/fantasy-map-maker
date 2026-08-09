import { useEffect, useState } from "react";
import { MapStage } from "../canvas/MapStage";
import { callGeometry } from "../engine/worker/client";
import {
  download,
  exportFilename,
  planExport,
  renderScene,
  toBlob,
  type Format,
} from "../export/image";
import { loadScene } from "../persistence/drafts";
import { useAutosave, type SaveStatus } from "../persistence/useAutosave";
import { navigate, usePage } from "../routes";
import type { Label } from "../scene/types";
import { selectLandmasses, useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";
import { TooltipProvider } from "./controls";
import { ExportDialog, GenerateDialog } from "./dialogs";
import { MapPanel } from "./MapPanel";
import { Toasts } from "./Toasts";
import { Toolbar } from "./Toolbar";
import { ToolOptions } from "./ToolOptions";
import { hint } from "./variants";

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const SAVE_LABEL: Record<SaveStatus, string> = {
  new: "saves as you work",
  saving: "saving…",
  saved: "saved",
  failed: "not saved",
};

/**
 * `/maps/edit/{uuid}` — the URL is the source of truth (`14` §4.4).
 *
 * One rule, and it is the lazy one: **if the store already holds this map, do nothing.**
 * `useEditorStore` is a module singleton, so the scene and its undo stack survive the
 * editor's unmount — which is what makes Back from the create page return you to your map
 * with history intact, and it is *less* code than reloading unconditionally.
 *
 * Anything else loads by id, which clears the stack (ADR-35, correctly: a step carries
 * scenes belonging to the map that produced them). It deliberately does not go through
 * autosave's old restore path, which refuses when `past.length > 0` — right for a boot race,
 * wrong for a navigation someone asked for.
 */
export function EditorRoute({ id }: { id: string }) {
  const [ready, setReady] = useState(() => useEditorStore.getState().scene.meta.id === id);
  const title = useEditorStore((s) => s.scene.meta.title);
  usePage(`${ready ? title || "Untitled Map" : "Opening"} · map.byfauzi.com`);

  useEffect(() => {
    if (useEditorStore.getState().scene.meta.id === id) return setReady(true);
    let cancelled = false;
    setReady(false);
    void loadScene(id)
      .then((scene) => {
        if (cancelled) return;
        // Never mint a map with this id: a stale bookmark must not resurrect a deleted map
        // (§4.4). The address was wrong, so the answer is the gallery.
        if (!scene) {
          useToastStore.getState().show("That map is not on this device.");
          return void navigate("/maps", { replace: true });
        }
        useEditorStore.getState().openScene(scene);
        setReady(true);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        useToastStore.getState().show(`Could not open that map: ${err.message}`);
        void navigate("/maps", { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!ready)
    return (
      <div className="mbf:grid mbf:h-full mbf:place-items-center">
        <p className={hint()}>Opening your map…</p>
        <Toasts />
      </div>
    );
  return <Editor />;
}

/**
 * The shell: toolbar across the top, contextual tool options left, the map, and what the
 * map *is* on the right (`ux-wireframe.html`). It owns nothing but the two modals and the
 * two async actions they run — every control below reads and writes the store directly.
 */
function Editor() {
  const scene = useEditorStore((s) => s.scene);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const saveStatus = useAutosave();
  const rival = useRivalTab(scene.meta.id);

  const [generating, setGenerating] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** The label the rail asked to rename; the stage opens its editor on it. */
  const [editingLabel, setEditingLabel] = useState<Label | undefined>();

  /**
   * 10h — generate the world in the worker, then apply the whole replace as one command.
   * Rings need no special handling: they are derived from the landmasses, so they follow.
   */
  const generate = async () => {
    setGenerating(true);
    try {
      const state = useEditorStore.getState();
      const result = await callGeometry("generate", {
        canvas: { w: state.scene.meta.canvas.w, h: state.scene.meta.canvas.h },
        ...state.scene.generator,
        seaLevel: state.seaLevel,
        mountainDensity: state.mountainDensity,
        forestDensity: state.forestDensity,
        rotation: state.generatorRotation,
        coastDetail: state.scene.settings.coastDetail,
      });
      useEditorStore.getState().applyGenerated(result);
      setGenerateOpen(false);
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

  /**
   * The world the create page asked for (§4.3). Cleared before it runs, so a re-render — or
   * the second mount StrictMode performs — cannot generate twice.
   */
  useEffect(() => {
    if (!useEditorStore.getState().generateOnOpen) return;
    useEditorStore.setState({ generateOnOpen: false });
    void generate();
  }, []); // once, on arrival

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
        {rival && (
          <p
            data-tab-warning
            className="mbf:bg-note/15 mbf:text-note mbf:border-note/30 mbf:border-b mbf:px-3 mbf:py-1 mbf:text-[11px]"
          >
            This map is open in another tab. Both tabs save to the same place, so the last one to
            write wins — close one before you keep editing.
          </p>
        )}
        <Toolbar onGenerate={() => setGenerateOpen(true)} onExport={() => setExportOpen(true)} />

        <div className="mbf:flex mbf:min-h-0 mbf:grow">
          <ToolOptions onEditLabel={setEditingLabel} />
          <MapStage editing={editingLabel} />
          <MapPanel />
        </div>

        <p
          data-autosave
          className="mbf:bg-panel mbf:border-line mbf:text-muted mbf:border-t mbf:px-3 mbf:py-1 mbf:text-[11px]"
        >
          {SAVE_LABEL[saveStatus]}
        </p>
      </div>

      <GenerateDialog
        open={generateOpen}
        busy={generating}
        onGenerate={() => void generate()}
        onOpenChange={setGenerateOpen}
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

/**
 * Is this map open in another tab? (`14` §4.8, D8.)
 *
 * Linkable URLs make two tabs on one map easy, and both autosave to the same IndexedDB key
 * with no version check — last write wins, silently. Losing work with no signal is the one
 * category that does not get simplified away, so it is detected and warned about rather than
 * documented. Not blocked: two monitors is a legitimate way to work.
 *
 * `hello` announces, `ack` answers. Two message types rather than one, or each tab's reply
 * would be another tab's announcement and the channel would ring forever.
 */
function useRivalTab(id: string): boolean {
  const [rival, setRival] = useState(false);

  useEffect(() => {
    setRival(false);
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("map-byfauzi:open-maps");
    channel.onmessage = (event: MessageEvent<{ type: string; id: string }>) => {
      if (event.data.id !== id) return;
      setRival(true);
      if (event.data.type === "hello") channel.postMessage({ type: "ack", id });
    };
    channel.postMessage({ type: "hello", id });
    return () => channel.close();
  }, [id]);

  return rival;
}
