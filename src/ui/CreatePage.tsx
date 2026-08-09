import { Wand2 } from "lucide-react";
import { useState } from "react";
import { saveScene } from "../persistence/drafts";
import { navigate, usePage } from "../routes";
import { createEmptyScene } from "../scene/scene";
import { CANVAS_PRESETS, type CanvasPreset } from "../scene/types";
import { useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";
import { GenerateForm } from "./dialogs";
import { Link } from "./Link";
import { Toasts } from "./Toasts";
import { button, hint, panelTitle, segment, toolButton } from "./variants";

const PRESETS: CanvasPreset[] = ["landscape", "square", "portrait"];

/**
 * `/maps/create` — a page, not a redirect (`14` §4.3, D5).
 *
 * **Canvas size is free exactly once, at creation.** After that `resetCanvas(preset)` is
 * both *change canvas size* and *empty the map*, which is why the `Map` menu puts it behind
 * a confirm — and why there had to be a screen at creation to offer it without one. Landscape
 * is the default (D6), so the blank path is one click.
 *
 * **Nothing reaches IndexedDB until the user clicks through.** That is the whole reason this
 * is a page rather than the mint-and-redirect it was first drafted as: a redirect would write
 * an empty draft for every bounce off the landing page. Backing out leaves the entry
 * unreplaced, no scene minted, and Back returns to the map you were editing with its undo
 * stack intact — the store is a module singleton (§4.4).
 */
export function CreatePage() {
  usePage("Start a new map · map.byfauzi.com");
  const [preset, setPreset] = useState<CanvasPreset>("landscape");
  const [configuring, setConfiguring] = useState(false);
  const [busy, setBusy] = useState(false);
  const size = CANVAS_PRESETS[preset];

  /**
   * Mint the scene, write it once, and hand over to the editor.
   *
   * The generator settings come across from whatever the form has been set to — `GenerateForm`
   * writes to `scene.generator` of the scene in the store, and a fresh `createEmptyScene`
   * would throw away the code you just pasted.
   *
   * **Generation itself runs in the editor, after the navigation** (D7): the app appears
   * sooner, the existing "Generated N landmasses" toast and its undo still cover it, and no
   * second loading state is invented for 250–420 ms of worker time.
   *
   * **`replace`, not push** (§4.7, trap 1): a setup step you have finished is not a Back
   * target, and completing it a second time would mint a second map.
   */
  const start = async (generate: boolean) => {
    setBusy(true);
    const { generator } = useEditorStore.getState().scene;
    const scene = { ...createEmptyScene(preset), generator };
    useEditorStore.getState().openScene(scene);
    if (generate) useEditorStore.setState({ generateOnOpen: true });
    try {
      // Explicit, and the only write this page makes: autosave lives inside the editor, and
      // it starts by treating the scene it finds as already saved.
      await saveScene(scene);
    } catch (err) {
      useToastStore.getState().show(`Could not save the new map: ${(err as Error).message}`);
    }
    await navigate(`/maps/edit/${scene.meta.id}`, { replace: true });
  };

  return (
    <div className="mbf:mx-auto mbf:flex mbf:max-w-xl mbf:flex-col mbf:gap-5 mbf:p-6">
      <header className="mbf:flex mbf:items-baseline mbf:gap-3">
        <h1
          data-page-heading
          tabIndex={-1}
          className="mbf:font-display mbf:grow mbf:text-2xl mbf:outline-none"
        >
          Start a new map
        </h1>
        <Link to="/maps" className={button({ tone: "ghost" })}>
          Your maps
        </Link>
      </header>

      <section className="mbf:flex mbf:flex-col mbf:gap-2">
        <p className={panelTitle()}>Canvas</p>
        <div className={segment()}>
          {PRESETS.map((option) => (
            <button
              key={option}
              type="button"
              data-preset={option}
              data-preset-active={option === preset || undefined}
              className={toolButton({ active: option === preset })}
              onClick={() => setPreset(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <p data-canvas-size className={hint()}>
          {size.w} × {size.h} — pick it now: changing the canvas size later empties the map.
        </p>
      </section>

      {configuring ? (
        <section className="mbf:border-line mbf:flex mbf:flex-col mbf:gap-3 mbf:rounded-lg mbf:border mbf:p-3">
          <p className={panelTitle()}>Generate a world</p>
          <GenerateForm />
          <div className="mbf:flex mbf:justify-end mbf:gap-2">
            <button
              type="button"
              className={button()}
              onClick={() => setConfiguring(false)}
              disabled={busy}
            >
              Back
            </button>
            <button
              type="button"
              data-action="generate"
              className={button({ tone: "primary" })}
              disabled={busy}
              onClick={() => void start(true)}
            >
              {busy ? "Generating…" : "Generate world"}
            </button>
          </div>
        </section>
      ) : (
        <div className={segment()}>
          <button
            type="button"
            data-action="blank"
            className={button({ tone: "primary" })}
            disabled={busy}
            onClick={() => void start(false)}
          >
            Blank canvas
          </button>
          <button
            type="button"
            data-action="configure"
            className={button()}
            disabled={busy}
            onClick={() => setConfiguring(true)}
          >
            <Wand2 size={14} /> Generate a world
          </button>
        </div>
      )}
      <Toasts />
    </div>
  );
}
