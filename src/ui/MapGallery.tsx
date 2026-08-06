import { Dialog } from "radix-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import {
  deleteDraft,
  listDrafts,
  loadScene,
  putThumb,
  renameDraft,
  type DraftSummary,
} from "../persistence/drafts";
import { callGeometry } from "../engine/worker/client";
import { planExport, renderScene, toBlob } from "../export/image";
import type { Scene } from "../scene/types";
import { selectLandmasses, useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";
import { ConfirmDialog } from "./dialogs";
import {
  button,
  dialogActions,
  dialogContent,
  dialogDescription,
  dialogOverlay,
  dialogTitle,
  hint,
  toolButton,
} from "./variants";

/**
 * The local map gallery — WP-22.
 *
 * `drafts.ts` has stored a **keyed collection** since WP-12: `meta.id` is the keyPath,
 * deliberately, so P2 can claim drafts into an account. What was missing was the query and
 * a way in. Until now `newScene` minted a fresh `meta.id` on every "new canvas", so each
 * click wrote a *new* record and left the previous map on disk with nothing pointing at it —
 * this dialog is as much about surfacing maps that already exist as about making new ones.
 *
 * **Local only.** P2's WP-3 folds cloud maps into the same list with sync badges, so the row
 * takes a plain summary and nothing here assumes where a map came from — but no seam is
 * built for it either, because one source needs no abstraction over sources.
 */

/** Wide enough for a retina row at 48 px, small enough that the blob stays a few KB. */
const THUMB_WIDTH = 240;

const when = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
};

export function MapGallery({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const scene = useEditorStore((s) => s.scene);
  const openScene = useEditorStore((s) => s.openScene);
  const setTitle = useEditorStore((s) => s.setTitle);
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirming, setConfirming] = useState<DraftSummary | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  /** The scene the stored thumbnail was made from, so reopening does not re-render it. */
  const captured = useRef<Scene | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDrafts(await listDrafts());
    } catch (err) {
      useToastStore.getState().show(`Could not list your maps: ${(err as Error).message}`);
      setDrafts([]);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh, scene.meta.title]);

  /**
   * The open map's thumbnail, rendered when the gallery opens and not before.
   *
   * Deliberately **not** on the autosave tick: a derivation costs 119–488 ms (`08` C2) and
   * a render is a full-map draw, so paying it every 800 ms to keep a picture nobody is
   * looking at current would be the worst trade in the app. Paying it when the gallery
   * opens is once per look.
   *
   * It runs *after* the dialog is up and refreshes the row when it lands, so an expensive
   * map never delays the list. Other drafts keep a placeholder rather than getting a
   * ringless render — `renderScene` needs worker-derived bands, and a map missing its
   * coastal rings is a *wrong* picture, not a missing one.
   */
  useEffect(() => {
    if (!open) return;
    const current = useEditorStore.getState().scene;
    if (captured.current === current) return;
    captured.current = current;
    let cancelled = false;

    void (async () => {
      try {
        const { canvas } = current.meta;
        const landmasses = selectLandmasses(useEditorStore.getState());
        const bands =
          current.settings.coastalRings && landmasses.length > 0
            ? (
                await callGeometry("deriveRings", {
                  landmasses,
                  canvas: { x: 0, y: 0, w: canvas.w, h: canvas.h },
                  ringCount: current.settings.ringCount,
                  ringGap: current.settings.ringGap,
                })
              ).bands
            : [];
        if (cancelled) return;
        const plan = planExport(canvas, THUMB_WIDTH / canvas.w);
        const blob = await toBlob(renderScene(current, bands, plan), "webp");
        if (cancelled) return;
        await putThumb(current.meta.id, blob);
        if (!cancelled) await refresh();
      } catch {
        // A thumbnail is decoration. Failing to make one must never break the gallery, and
        // a toast about it would be noise for something the placeholder already communicates.
        captured.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, refresh]);

  useEffect(() => {
    if (editing) nameInput.current?.select();
  }, [editing]);

  const openMap = async (id: string) => {
    if (id === scene.meta.id) return onOpenChange(false);
    try {
      const next = await loadScene(id);
      if (!next) {
        useToastStore.getState().show("That map is no longer on this device.");
        return void refresh();
      }
      openScene(next);
      onOpenChange(false);
    } catch (err) {
      useToastStore.getState().show(`Could not open that map: ${(err as Error).message}`);
    }
  };

  /**
   * One rename, two destinations. The open map has to go through the store or the editor
   * would keep showing the old name until a reload — autosave then writes it. Any other map
   * has no store copy to update, so it is edited on disk directly.
   */
  const commitRename = async (id: string) => {
    const title = draftName.trim();
    setEditing(null);
    if (!title || title === drafts?.find((d) => d.id === id)?.title) return;
    try {
      if (id === scene.meta.id) setTitle(title);
      else await renameDraft(id, title);
      await refresh();
    } catch (err) {
      useToastStore.getState().show(`Could not rename that map: ${(err as Error).message}`);
    }
  };

  const remove = async (target: DraftSummary) => {
    setConfirming(null);
    try {
      await deleteDraft(target.id);
      // Deleting the map you are looking at leaves the editor holding a scene with no
      // record. Autosave would write it straight back, so step to the newest survivor —
      // or to a blank map if that was the last one.
      if (target.id === scene.meta.id) {
        const rest = await listDrafts();
        const next = rest[0] ? await loadScene(rest[0].id) : null;
        if (next) openScene(next);
        else useEditorStore.getState().newMap(scene.meta.canvas.preset);
      }
      await refresh();
      useToastStore.getState().show(`Deleted “${target.title}”.`);
    } catch (err) {
      useToastStore.getState().show(`Could not delete that map: ${(err as Error).message}`);
    }
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className={dialogOverlay()} />
          <Dialog.Content className={dialogContent()} data-dialog="gallery">
            <Dialog.Title className={dialogTitle()}>My maps</Dialog.Title>
            <Dialog.Description className={dialogDescription()}>
              Every map saved on this device, newest first.
            </Dialog.Description>

            <ul
              data-gallery-list
              data-gallery-count={drafts?.length ?? -1}
              className="mbf:flex mbf:max-h-80 mbf:flex-col mbf:gap-1 mbf:overflow-y-auto"
            >
              {drafts?.map((draft) => {
                const current = draft.id === scene.meta.id;
                return (
                  <li
                    key={draft.id}
                    data-draft={draft.id}
                    data-draft-current={current || undefined}
                    className={
                      "mbf:border-line mbf:flex mbf:items-center mbf:gap-2 mbf:rounded-md " +
                      "mbf:border mbf:p-2 " +
                      (current ? "mbf:border-accent" : "")
                    }
                  >
                    <Thumb draft={draft} />
                    <div className="mbf:flex mbf:min-w-0 mbf:grow mbf:flex-col">
                      {editing === draft.id ? (
                        <input
                          ref={nameInput}
                          data-rename-input
                          aria-label="Map name"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onBlur={() => void commitRename(draft.id)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") void commitRename(draft.id);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className={
                            "mbf:bg-panel mbf:border-accent mbf:text-ink mbf:rounded mbf:border " +
                            "mbf:px-1 mbf:py-0.5 mbf:text-xs mbf:outline-none"
                          }
                        />
                      ) : (
                        <button
                          type="button"
                          data-open-draft={draft.id}
                          className="mbf:cursor-pointer mbf:truncate mbf:text-left mbf:text-xs"
                          onClick={() => void openMap(draft.id)}
                        >
                          {draft.title || "Untitled Map"}
                          {current && <span className="mbf:text-accent"> · open</span>}
                        </button>
                      )}
                      <span className="mbf:text-muted mbf:font-mono mbf:text-[10px]">
                        {draft.canvas ? `${draft.canvas.w}×${draft.canvas.h} · ` : ""}
                        {when(draft.updatedAt)}
                      </span>
                    </div>
                    <button
                      type="button"
                      data-rename-draft={draft.id}
                      aria-label={`Rename ${draft.title}`}
                      className={toolButton()}
                      onClick={() => {
                        setDraftName(draft.title);
                        setEditing(draft.id);
                      }}
                    >
                      {editing === draft.id ? <Check size={13} /> : <Pencil size={13} />}
                    </button>
                    <button
                      type="button"
                      data-delete-draft={draft.id}
                      aria-label={`Delete ${draft.title}`}
                      className={toolButton()}
                      onClick={() => setConfirming(draft)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>

            {drafts?.length === 0 && (
              <p className={hint()}>No saved maps yet — this one saves as soon as you draw.</p>
            )}

            <div className={dialogActions()}>
              <Dialog.Close className={button({ tone: "ghost" })}>Close</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={confirming !== null}
        title={`Delete “${confirming?.title ?? ""}”?`}
        /**
         * Says *this device* on purpose. P2 gives a map a cloud copy that this delete will
         * not touch (ADR-33's mirror rule), and a confirmation reading "delete this map"
         * would teach the wrong thing now and be wrong later.
         */
        description="This removes the map from this device. It cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => void (confirming && remove(confirming))}
        onOpenChange={(next) => !next && setConfirming(null)}
      />
    </>
  );
}

/** A stored thumbnail, or a plain placeholder for a map not opened since WP-22 landed. */
function Thumb({ draft }: { draft: DraftSummary }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!draft.thumb) return;
    const objectUrl = URL.createObjectURL(draft.thumb);
    setUrl(objectUrl);
    // Revoke, or every gallery open leaks a blob URL for the lifetime of the document.
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [draft.thumb]);

  return (
    <span
      data-thumb={url ? "image" : "placeholder"}
      className="mbf:bg-panel mbf:border-line mbf:h-9 mbf:w-12 mbf:shrink-0 mbf:overflow-hidden mbf:rounded mbf:border"
    >
      {url && <img src={url} alt="" className="mbf:h-full mbf:w-full mbf:object-cover" />}
    </span>
  );
}
