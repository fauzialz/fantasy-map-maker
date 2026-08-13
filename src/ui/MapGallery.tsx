import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import {
  deleteDraft,
  listDrafts,
  putThumb,
  renameDraft,
  type DraftSummary,
} from "../persistence/drafts";
import { deriveForRender, planExport, renderScene, toBlob } from "../export/image";
import { savedScroll } from "../routes";
import type { Scene } from "../scene/types";
import { useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";
import { ConfirmDialog } from "./dialogs";
import { Link } from "./Link";
import { hint, toolButton } from "./variants";

/**
 * The local map list — WP-22, and the body of `/maps` since WP-30.
 *
 * `drafts.ts` has stored a **keyed collection** since WP-12: `meta.id` is the keyPath,
 * deliberately, so P2 can claim drafts into an account. What was missing was the query and
 * a way in. Until WP-22, `newScene` minted a fresh `meta.id` on every "new canvas", so each
 * click wrote a *new* record and left the previous map on disk with nothing pointing at it —
 * this list is as much about surfacing maps that already exist as about making new ones.
 *
 * **The dialog shell is gone** (`14` D3). Opening a map already clears the undo stack
 * (ADR-35), which makes it a navigation in everything but presentation — so a row is now a
 * real `<a href="/maps/edit/{id}">`, which also means Ctrl-click opens a second map in a
 * second tab, for free.
 *
 * **Local only.** P2's WP-3 folds cloud maps into the same list with sync badges, so the row
 * takes a plain summary and nothing here assumes where a map came from — but no seam is
 * built for it either, because one source needs no abstraction over sources.
 */

/**
 * Wide enough for a retina row at 48 px, small enough that the blob stays a few KB.
 *
 * Measured at this width: **1.5 KB** for an empty map and **15.7 KB** for a generated world,
 * so ~320 KB across ADR-33's ~20-draft cap. **WebP is not a default here** — the same image
 * as PNG is 79.4 KB, and 44× worse on an empty map, because the parchment is procedural noise
 * that lossless compression cannot help. Full table in WP-22's entry in
 * `architecture/v1/05-p0-build-checklist.md`; re-measure there before changing either.
 */
const THUMB_WIDTH = 240;

const when = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
};

export function MapGallery({ onEmpty }: { onEmpty: () => void }) {
  const scene = useEditorStore((s) => s.scene);
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
    void refresh();
  }, [refresh, scene.meta.title]);

  /**
   * Nothing to show, and we know it — hand the page over to the create page (§4.2). This
   * fires only once the read has *resolved*: `null` is "still asking", and telling a
   * returning user they have no maps because IndexedDB has not answered yet would be the
   * worst mistake this page can make. At P2 the same guard grows a second source.
   *
   * The scroll restoration rides along here for the same reason — Back to a list can only
   * be put back where it was once the list exists to scroll.
   */
  useEffect(() => {
    if (!drafts) return;
    if (drafts.length === 0) onEmpty();
    else window.scrollTo(0, savedScroll());
  }, [drafts, onEmpty]);

  /**
   * The last-opened map's thumbnail, rendered when this page opens and not before.
   *
   * Deliberately **not** on the autosave tick: a derivation costs 119–488 ms (`08` C2) and
   * a render is a full-map draw, so paying it every 800 ms to keep a picture nobody is
   * looking at current would be the worst trade in the app. Paying it when the gallery
   * opens is once per look.
   *
   * It runs *after* the list is up and refreshes the row when it lands, so an expensive
   * map never delays the page. Other drafts keep a placeholder rather than getting a
   * ringless render — `renderScene` needs worker-derived bands, and a map missing its
   * coastal rings is a *wrong* picture, not a missing one.
   *
   * **There is no abort flag, and that is the fix rather than an omission.** This used to
   * bail on unmount, which was invisible while the gallery was a modal — the effect was gated
   * on `open`, false at mount, so StrictMode's discarded pass did nothing. As a *page* it runs
   * at mount, and StrictMode remounts it: the first pass claimed `captured`, started the work
   * and was then cancelled, and the second pass skipped because the ref was already taken. The
   * capture never happened at all in dev, while production was fine — the worst shape a bug
   * can have. `captured` is a ref, so it already answers "has this scene been done"; the flag
   * was answering "is this effect still mounted", which a write to IndexedDB does not care
   * about. `refresh` setting state after an unmount is a no-op in React 19.
   */
  useEffect(() => {
    const current = useEditorStore.getState().scene;
    if (captured.current === current) return;
    captured.current = current;

    void (async () => {
      try {
        const { canvas } = current.meta;
        const derived = await deriveForRender(current);
        const plan = planExport(canvas, THUMB_WIDTH / canvas.w);
        const blob = await toBlob(renderScene(current, derived, plan), "webp");
        await putThumb(current.meta.id, blob);
        await refresh();
      } catch {
        // A thumbnail is decoration. Failing to make one must never break the gallery, and
        // a toast about it would be noise for something the placeholder already communicates.
        captured.current = null;
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (editing) nameInput.current?.select();
  }, [editing]);

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
      // Deleting the map the store still holds would let a Back to its address resurrect it:
      // the editor route's "same id, do nothing" rule would show it, and autosave would write
      // it straight back. Standing the store on a fresh scene makes that address genuinely
      // unknown, which is the answer §4.4 wants for a stale one.
      if (target.id === scene.meta.id) useEditorStore.getState().newMap(scene.meta.canvas.preset);
      await refresh();
      useToastStore.getState().show(`Deleted “${target.title}”.`);
    } catch (err) {
      useToastStore.getState().show(`Could not delete that map: ${(err as Error).message}`);
    }
  };

  return (
    <>
      {/* `null` is "still asking". Rendering an empty grid first would flash "no maps" at a
          returning user for as long as IndexedDB takes to answer, and then redirect. */}
      {!drafts ? (
        <p className={hint()}>Looking for your maps…</p>
      ) : (
        <ul
          data-gallery-list
          data-gallery-count={drafts.length}
          className="mbf:grid mbf:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] mbf:gap-3"
        >
          {drafts.map((draft) => {
            const current = draft.id === scene.meta.id;
            return (
              <li
                key={draft.id}
                data-draft={draft.id}
                data-draft-current={current || undefined}
                className={
                  "mbf:bg-panel mbf:border-line mbf:flex mbf:flex-col mbf:gap-2 mbf:rounded-lg " +
                  "mbf:border mbf:p-2 " +
                  (current ? "mbf:border-accent" : "")
                }
              >
                <Link
                  to={`/maps/edit/${draft.id}`}
                  data-open-draft={draft.id}
                  className="mbf:focus-visible:outline-accent mbf:block mbf:rounded-md mbf:focus-visible:outline-2"
                >
                  <Thumb draft={draft} />
                </Link>
                <div className="mbf:flex mbf:items-center mbf:gap-1">
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
                      <Link
                        to={`/maps/edit/${draft.id}`}
                        className="mbf:truncate mbf:text-xs mbf:font-medium"
                      >
                        {draft.title || "Untitled Map"}
                        {current && <span className="mbf:text-accent"> · open</span>}
                      </Link>
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
                </div>
              </li>
            );
          })}
        </ul>
      )}

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
      className="mbf:bg-sink mbf:border-line mbf:block mbf:aspect-4/3 mbf:overflow-hidden mbf:rounded-md mbf:border"
    >
      {url && <img src={url} alt="" className="mbf:h-full mbf:w-full mbf:object-cover" />}
    </span>
  );
}
