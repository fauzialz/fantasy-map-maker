import { ChevronDown, Copy, Dices } from "lucide-react";
import { AlertDialog, Collapsible, Dialog } from "radix-ui";
import { useState } from "react";
import type { Size } from "../canvas/viewport";
import { formatWorldCode, parseWorldCode } from "../engine/generator/worldCode";
import { FORMATS, planExport, type Format } from "../export/image";
import type { WorldType } from "../scene/types";
import { useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";
import { Slider, Toggle } from "./controls";
import {
  button,
  dialogActions,
  dialogContent,
  dialogDescription,
  dialogOverlay,
  dialogTitle,
  field,
  fieldLabel,
  hint,
  segment,
  toolButton,
} from "./variants";

/**
 * The two modals. Both were `window.*` calls through P0 (see the WP-13 entry in the build
 * checklist) — which worked, but a native dialog cannot express more than two choices, is
 * unstyleable, and blocks the main thread while it is open.
 */

interface ConfirmProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onOpenChange,
}: ConfirmProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogOverlay()} />
        <AlertDialog.Content className={dialogContent()} data-dialog="confirm">
          <AlertDialog.Title className={dialogTitle()}>{title}</AlertDialog.Title>
          <AlertDialog.Description className={dialogDescription()}>
            {description}
          </AlertDialog.Description>
          <div className={dialogActions()}>
            <AlertDialog.Cancel asChild>
              <button type="button" className={button()}>
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                data-action="confirm"
                className={button({ tone: "primary" })}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * Help → Keyboard shortcuts (`11` §3).
 *
 * **Every row here is read off a real handler**, not written from memory: undo and redo from
 * the editor's own key handler, Delete/Backspace and Escape from `useSelection`, Enter and
 * Escape from `useSelection` and `useSplineTool`, the space-drag from `MapStage`. A shortcuts sheet
 * that lists something the app does not do is worse than no sheet.
 */
const SHORTCUTS: [string, string][] = [
  ["Ctrl / ⌘ + Z", "Undo"],
  ["Ctrl / ⌘ + Shift + Z", "Redo"],
  ["Delete · Backspace", "Delete the selection"],
  ["Escape", "Drop the selection, or abandon the river being drawn"],
  ["Enter", "Finish the river being drawn"],
  ["Shift + click", "Add to or remove from the selection"],
  ["Double-click land", "Select it and everything standing on it"],
  ["Space + drag", "Pan, whatever tool is in hand"],
  ["Scroll", "Zoom about the pointer"],
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlay()} />
        <Dialog.Content className={dialogContent()} data-dialog="shortcuts">
          <Dialog.Title className={dialogTitle()}>Keyboard shortcuts</Dialog.Title>
          <Dialog.Description className={dialogDescription()}>
            The pointer does the drawing; these are the rest.
          </Dialog.Description>

          <dl className="mbf:flex mbf:flex-col mbf:gap-2">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="mbf:flex mbf:items-baseline mbf:gap-3 mbf:text-xs">
                <dt className="mbf:text-ink mbf:w-44 mbf:shrink-0 mbf:font-mono mbf:text-[11px]">
                  {keys}
                </dt>
                <dd className="mbf:text-muted">{what}</dd>
              </div>
            ))}
          </dl>

          <div className={dialogActions()}>
            <Dialog.Close asChild>
              <button type="button" className={button()}>
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const WORLD_TYPES: WorldType[] = ["single", "archipelago", "multiple"];

/**
 * The seven inputs that decide a world, and the code that carries them (`11` §5).
 *
 * **Deliberately container-free.** The dialog below mounts it over a live map; WP-30's
 * `/maps/create` page mounts the same component on a scene that is always empty. Each
 * container supplies its own action row, because §5.1's warning line and button label are
 * exactly the difference between the two — there is no other branch.
 *
 * It reads and writes the store directly, like the rail it replaces. That is what makes
 * "pasting sets every control" true by construction: there is no copy of these values for
 * the sliders to disagree with.
 */
export function GenerateForm() {
  const generator = useEditorStore((s) => s.scene.generator);
  const seaLevel = useEditorStore((s) => s.seaLevel);
  const mountainDensity = useEditorStore((s) => s.mountainDensity);
  const forestDensity = useEditorStore((s) => s.forestDensity);
  const generatorRotation = useEditorStore((s) => s.generatorRotation);
  const setGenerator = useEditorStore((s) => s.setGenerator);
  const setAdvanced = useEditorStore((s) => s.setAdvanced);

  /** `null` = the field is showing the live code rather than something half-typed. */
  const [draft, setDraft] = useState<string | null>(null);
  const code = formatWorldCode({
    ...generator,
    seaLevel,
    mountainDensity,
    forestDensity,
    rotation: generatorRotation,
  });

  /**
   * Applied the moment the text parses, so a paste lands on the controls with nothing else
   * to press. A half-typed code simply does not parse yet, which is why this is silent.
   */
  const editCode = (text: string) => {
    setDraft(text);
    const world = parseWorldCode(text);
    if (!world) return;
    const {
      seaLevel: sea,
      mountainDensity: mountain,
      forestDensity: forest,
      rotation,
      ...meta
    } = world;
    setGenerator(meta);
    setAdvanced({
      seaLevel: sea,
      mountainDensity: mountain,
      forestDensity: forest,
      generatorRotation: rotation,
    });
  };

  /**
   * Complain only once the typing has stopped — half a code is not a wrong code. Dropping
   * the draft snaps the field back to the live code, so a rejected one leaves no trace and
   * "changes nothing" is visible rather than promised.
   */
  const settleCode = () => {
    if (draft !== null && draft.trim() !== "" && !parseWorldCode(draft))
      useToastStore.getState().show("That is not a world code we can read — nothing changed.");
    setDraft(null);
  };

  const copyCode = () => {
    void navigator.clipboard
      .writeText(code)
      .then(() => useToastStore.getState().show("World code copied"))
      .catch(() =>
        useToastStore.getState().show("Could not reach the clipboard — copy it by hand"),
      );
  };

  return (
    <div className="mbf:flex mbf:min-h-0 mbf:flex-col mbf:gap-3">
      {/* Only the parameters scroll. The world code stays put with its hint, because that
          hint is where the "canvas size is not in the code" promise is made. */}
      <div className="mbf:flex mbf:max-h-[60vh] mbf:flex-col mbf:gap-3 mbf:overflow-y-auto">
        <Slider
          label="Land amount"
          value={generator.landAmount}
          min={0.1}
          max={0.9}
          step={0.05}
          display={generator.landAmount.toFixed(2)}
          onChange={(landAmount) => setGenerator({ landAmount })}
        />
        <Slider
          label="Roughness"
          value={generator.roughness}
          min={0}
          max={1}
          step={0.05}
          display={generator.roughness.toFixed(2)}
          onChange={(roughness) => setGenerator({ roughness })}
        />
        <div className={segment()}>
          {WORLD_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              data-world-type={type}
              className={toolButton({ active: generator.worldType === type })}
              onClick={() => setGenerator({ worldType: type })}
            >
              {type}
            </button>
          ))}
        </div>

        <Collapsible.Root>
          <Collapsible.Trigger
            data-action="advanced"
            className="mbf:text-muted mbf:hover:text-ink mbf:group mbf:flex mbf:w-full mbf:cursor-pointer mbf:items-center mbf:gap-1 mbf:text-[11px]"
          >
            <ChevronDown
              size={12}
              className="mbf:transition-transform mbf:group-data-[state=open]:rotate-180"
            />
            Advanced
          </Collapsible.Trigger>
          <Collapsible.Content className="mbf:mt-2 mbf:flex mbf:flex-col mbf:gap-3">
            <Toggle
              label="Set sea level by hand"
              checked={seaLevel !== null}
              onChange={(on) => setAdvanced({ seaLevel: on ? 0.5 : null })}
            />
            <Slider
              label="Sea level"
              value={seaLevel ?? 0.5}
              min={0.05}
              max={0.95}
              step={0.05}
              disabled={seaLevel === null}
              display={seaLevel === null ? "from land amount" : seaLevel.toFixed(2)}
              /**
               * Normally the shoreline is *derived* — `generate.ts` takes the `1 - landAmount`
               * quantile of the elevation field, so "40% land" means 40% land. Overriding it
               * pins the shore at an absolute height instead, and costs two things: land amount
               * stops meaning what it says, and the mountain and tree bands move with it, since
               * `scatter.ts` computes both as fractions of the sea-to-peak range. The rail never
               * said any of that; the hint does.
               */
              hint="Off, the shoreline follows land amount. On, it pins to a height — so land amount stops meaning what it says, and the mountain and tree bands move with it."
              onChange={(value) => setAdvanced({ seaLevel: value })}
            />
            <Slider
              label="Mountain density"
              value={mountainDensity}
              min={0}
              max={1}
              step={0.05}
              display={mountainDensity.toFixed(2)}
              onChange={(value) => setAdvanced({ mountainDensity: value })}
            />
            <Slider
              label="Forest density"
              value={forestDensity}
              min={0}
              max={1}
              step={0.05}
              display={forestDensity.toFixed(2)}
              onChange={(value) => setAdvanced({ forestDensity: value })}
            />
            <Slider
              label="Rotation jitter"
              value={generatorRotation}
              min={0}
              max={45}
              step={1}
              display={`±${generatorRotation}°`}
              /**
               * The generator's own spread, not a read of the scatter brush's (`12` D4).
               * A world code has to rebuild the same world whatever the rail happens to be
               * set to, so this input travels in the code and that one does not.
               */
              hint="How far each mountain and tree turns from upright. Separate from the scatter brush's, so a world code always rebuilds the same world."
              onChange={(value) => setAdvanced({ generatorRotation: value })}
            />
          </Collapsible.Content>
        </Collapsible.Root>
      </div>

      <div className={field()}>
        <label className={fieldLabel()} htmlFor="world-code">
          <span>World code</span>
        </label>
        <input
          id="world-code"
          data-world-code
          spellCheck={false}
          value={draft ?? code}
          onChange={(e) => editCode(e.target.value)}
          onBlur={settleCode}
          onKeyDown={(e) => {
            e.stopPropagation(); // App's Ctrl+Z handler only spares INPUT for its own undo
            if (e.key === "Enter") settleCode();
          }}
          className={
            "mbf:bg-panel mbf:border-line mbf:text-ink mbf:focus:border-accent mbf:w-full " +
            "mbf:rounded-md mbf:border mbf:px-2 mbf:py-1 mbf:font-mono mbf:text-[11px] mbf:outline-none"
          }
        />
        <div className={segment()}>
          <button type="button" data-action="copy-code" className={button()} onClick={copyCode}>
            <Copy size={13} /> Copy
          </button>
          <button
            type="button"
            data-action="reroll"
            className={button()}
            onClick={() => setGenerator({ seed: Math.floor(Math.random() * 1e9) })}
          >
            <Dices size={13} /> Re-roll
          </button>
        </div>
        <p className={hint()}>
          Every setting above, in one string — paste one in to rebuild that world. Canvas size and
          coast detail are not in it, so a code never resizes your map.
        </p>
      </div>
    </div>
  );
}

interface GenerateProps {
  open: boolean;
  busy: boolean;
  onGenerate: () => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * ADR-21's confirm folded in (`11` §5.1). The rule it stated is kept exactly — the ask
 * still happens only when there is something to lose — but as a line and a verb in the
 * dialog you are already in, rather than a second modal stacked on this one.
 */
export function GenerateDialog({ open, busy, onGenerate, onOpenChange }: GenerateProps) {
  const replacing = useEditorStore((s) => s.scene.layers.some((layer) => layer.objects.length > 0));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlay()} />
        <Dialog.Content className={dialogContent()} data-dialog="generate">
          <Dialog.Title className={dialogTitle()}>Generate world</Dialog.Title>
          <Dialog.Description className={dialogDescription()}>
            Noise becomes coastlines, then mountains and woodland settle onto the land.
          </Dialog.Description>

          <GenerateForm />

          {replacing && (
            <p data-generate-warning className="mbf:text-note mbf:mt-4 mbf:text-xs">
              This replaces everything on the canvas. You can undo it in one step.
            </p>
          )}

          <div className={dialogActions()}>
            <Dialog.Close asChild>
              <button type="button" className={button()}>
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              data-action="generate"
              className={button({ tone: "primary" })}
              disabled={busy}
              onClick={onGenerate}
            >
              {busy ? "Generating…" : replacing ? "Replace map" : "Generate world"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ExportProps {
  open: boolean;
  canvas: Size;
  busy: boolean;
  onExport: (format: Format, scale: number) => void;
  onOpenChange: (open: boolean) => void;
}

const SCALES = [1, 2, 4];

export function ExportDialog({ open, canvas, busy, onExport, onOpenChange }: ExportProps) {
  const [format, setFormat] = useState<Format>("png");
  const [scale, setScale] = useState(2);
  const plan = planExport(canvas, scale);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlay()} />
        <Dialog.Content className={dialogContent()} data-dialog="export">
          <Dialog.Title className={dialogTitle()}>Export image</Dialog.Title>
          <Dialog.Description className={dialogDescription()}>
            The whole map, drawn at full resolution — not a screenshot of the view.
          </Dialog.Description>

          <div className="mbf:flex mbf:flex-col mbf:gap-3">
            <div className={segment()}>
              {(Object.keys(FORMATS) as Format[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  data-format={id}
                  className={toolButton({ active: format === id })}
                  onClick={() => setFormat(id)}
                >
                  {id.toUpperCase()}
                </button>
              ))}
            </div>
            <div className={segment()}>
              {SCALES.map((value) => (
                <button
                  key={value}
                  type="button"
                  data-scale={value}
                  className={toolButton({ active: scale === value })}
                  onClick={() => setScale(value)}
                >
                  {value}×
                </button>
              ))}
            </div>
            <p
              data-export-plan
              className="mbf:text-muted mbf:font-mono mbf:text-[11px] mbf:leading-relaxed"
            >
              {plan.w}×{plan.h}
              {plan.capped && (
                <span className="mbf:text-note">
                  {" "}
                  · capped from {scale}× to {plan.scale.toFixed(2)}×, the export limit
                </span>
              )}
            </p>
          </div>

          <div className={dialogActions()}>
            <Dialog.Close asChild>
              <button type="button" className={button()}>
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              data-action="export"
              className={button({ tone: "primary" })}
              disabled={busy}
              onClick={() => onExport(format, scale)}
            >
              {busy ? "Exporting…" : "Export"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
