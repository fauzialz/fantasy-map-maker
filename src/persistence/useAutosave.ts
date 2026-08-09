import { useEffect, useState } from "react";
import { useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";
import { saveScene } from "./drafts";

/** At most one write per this long — enough that a scatter drag or slider sweep coalesces. */
const SAVE_EVERY_MS = 800;

export type SaveStatus = "new" | "saving" | "saved" | "failed";

/**
 * The live editor's flush, or a no-op when no editor is mounted.
 *
 * A module-level handle rather than a hook result, because the caller is `navigate()` — and
 * by the time React has unmounted the editor the throttle it was holding is gone. The flush
 * has to run *before* that, from outside the tree (`14` §4.7).
 */
let activeFlush: (() => Promise<void>) | null = null;

export const flushAutosave = (): Promise<void> => activeFlush?.() ?? Promise.resolve();

/**
 * Autosave every scene change (WP-12), throttled.
 *
 * **Throttled, not debounced.** A debounce waits out the burst, so an isolated edit — one
 * click on Re-roll — would sit unwritten for the whole interval, and a scatter drag that
 * keeps changing the scene for five seconds would write *nothing* the entire time. Saving
 * on the leading edge instead puts an idle edit on disk in **~20 ms** (measured: a
 * ~220 KB generated scene, clicking Re-roll and polling IndexedDB), and caps a busy one at
 * one write per interval. A driver reloading the page straight after a click is what
 * turned this up.
 *
 * That ~20 ms is the residual loss window, and hiding the page does not close it: a
 * transaction opened during unload is not guaranteed to commit, and a hard navigation
 * inside the window does abort it. The flush below narrows the tail; the leading-edge save
 * is what makes the window small enough not to matter.
 *
 * **Restoring is no longer this hook's business** (WP-30). The map to open is in the URL, so
 * the editor route loads it — which is why `rememberOpen` and the newest-draft fallback were
 * deleted rather than moved. This hook mounts *inside* the editor, so the gallery and the
 * create page write nothing at all: §4.3's "no draft until the user clicks through" holds by
 * construction rather than by a guard.
 */
export function useAutosave(): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("new");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** What is already on disk, so an opened map doesn't immediately save itself back. */
    let saved = useEditorStore.getState().scene;
    let pending = saved;
    let lastSaveAt = 0;

    const flush = async () => {
      clearTimeout(timer);
      const { scene } = useEditorStore.getState();
      if (scene === saved) return;
      lastSaveAt = Date.now();
      setStatus("saving");
      try {
        await saveScene(scene);
        saved = scene;
        setStatus("saved");
      } catch (err) {
        // Leave `saved` alone: the next change retries rather than writing this one off.
        setStatus("failed");
        useToastStore.getState().show(`Autosave failed: ${(err as Error).message}`);
      }
    };
    activeFlush = flush;

    // Fires for every state change, most of which are session state (tool, brush, hover).
    // Comparing scene identity keeps a mouse-move from endlessly pushing the save out.
    const unsubscribe = useEditorStore.subscribe((state) => {
      if (state.scene === pending) return;
      pending = state.scene;
      clearTimeout(timer);
      timer = setTimeout(
        () => void flush(),
        Math.max(0, SAVE_EVERY_MS - (Date.now() - lastSaveAt)),
      );
    });

    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    // Safari can go straight to pagehide without ever reporting hidden.
    window.addEventListener("pagehide", onPageHide);

    return () => {
      // Only if it is still ours: StrictMode mounts twice, and the discarded run's cleanup
      // would otherwise unhook the live run's flush.
      if (activeFlush === flush) activeFlush = null;
      unsubscribe();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return status;
}
