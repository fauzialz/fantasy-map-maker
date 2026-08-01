import { AlertDialog, Dialog } from "radix-ui";
import { useState } from "react";
import type { Size } from "../canvas/viewport";
import { FORMATS, planExport, type Format } from "../export/image";
import {
  button,
  dialogActions,
  dialogContent,
  dialogDescription,
  dialogOverlay,
  dialogTitle,
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
