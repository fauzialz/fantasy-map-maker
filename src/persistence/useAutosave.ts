import { useEffect, useState } from "react";
import { useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";
import type { Scene } from "../scene/types";
import { loadLatestScene, loadScene, rememberOpen, rememberedOpen, saveScene } from "./drafts";

/** At most one write per this long — enough that a scatter drag or slider sweep coalesces. */
const SAVE_EVERY_MS = 800;

export type SaveStatus = "loading" | "new" | "restored" | "saving" | "saved" | "failed";

/**
 * Restore the last draft on startup, then autosave every scene change (WP-12).
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
 */
export function useAutosave(): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("loading");

  useEffect(() => {
    /**
     * The load is in flight across an unmount, and StrictMode unmounts every effect once.
     * Without this the discarded run still applies its restore, which the live run then
     * reads as an edit and writes straight back — a wasted save that also starts the
     * throttle, delaying the user's next real one.
     */
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** What is already on disk, so a restore doesn't immediately save itself back. */
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

    /**
     * The map that was open, falling back to the newest (WP-22).
     *
     * `loadLatestScene` alone was right while there was one working copy. With a gallery it
     * is wrong in a specific way: open an older map, change nothing, reload, and "newest by
     * `updatedAt`" hands back a *different* map. The remembered id is tried first and the
     * fallback covers a draft deleted since — including deleted in another tab.
     */
    const restore = async (): Promise<Scene | null> => {
      const remembered = rememberedOpen();
      return (remembered ? await loadScene(remembered) : null) ?? (await loadLatestScene());
    };

    void restore()
      .then((scene) => {
        if (cancelled) return;
        if (!scene) {
          setStatus("new");
          return;
        }
        // Never restore over work already in progress: the load is async, and a draft
        // landing on top of a stroke the user just painted would be the data loss this
        // package exists to prevent.
        if (useEditorStore.getState().past.length > 0) return;
        saved = pending = scene;
        useEditorStore.setState({ scene, selection: [] });
        setStatus("restored");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setStatus("failed");
        useToastStore.getState().show(`Could not read your saved map: ${err.message}`);
      });

    // Fires for every state change, most of which are session state (tool, brush, hover).
    // Comparing scene identity keeps a mouse-move from endlessly pushing the save out.
    const unsubscribe = useEditorStore.subscribe((state) => {
      if (state.scene === pending) return;
      // One place catches every way the open map can change — a new map, opening one from
      // the gallery, or the restore above — rather than each caller remembering to.
      if (state.scene.meta.id !== pending.meta.id) rememberOpen(state.scene.meta.id);
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
      cancelled = true;
      unsubscribe();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return status;
}
