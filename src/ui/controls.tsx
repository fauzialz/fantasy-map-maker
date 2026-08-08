import { Slider as RadixSlider, Switch as RadixSwitch, Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";
import {
  field,
  fieldLabel,
  fieldValue,
  sliderRange,
  sliderRoot,
  sliderThumb,
  sliderTrack,
  switchRoot,
  switchRow,
  switchThumb,
} from "./variants";

/**
 * The Radix primitives, dressed in our tokens. Everything the panels use goes through
 * here, so the accessibility (keyboard, roles, focus) comes from Radix and the look comes
 * from one place — `06-frontend-styling.md`'s primitive inventory.
 */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  /** shown on the right of the label; defaults to the raw value */
  display?: string;
  onChange: (value: number) => void;
  /** Fired once when the drag ends — the seam a coalesced undo step closes on. */
  onCommit?: (value: number) => void;
  hint?: string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  display,
  onChange,
  onCommit,
  hint,
}: SliderProps) {
  return (
    <div className={field()}>
      <label className={fieldLabel()}>
        <span>{label}</span>
        <span className={fieldValue()}>{display ?? value}</span>
      </label>
      <RadixSlider.Root
        className={sliderRoot()}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        onValueChange={([next]) => onChange(next)}
        onValueCommit={([next]) => onCommit?.(next)}
      >
        <RadixSlider.Track className={sliderTrack()}>
          <RadixSlider.Range className={sliderRange()} />
        </RadixSlider.Track>
        {/*
          The name has to be on the **thumb**. Radix puts `role="slider"` and `aria-valuenow`
          there, while `Root` is a plain span — so an `aria-label` on the root alone is inert,
          and a screen reader announced every slider in this app as an unnamed "slider, 260".
          Found by WP-24's driver, which read `aria-valuenow` off the root and got nothing.
          The root keeps its copy: it is inert for assistive tech but it is the handle every
          driver written so far selects on.
        */}
        <RadixSlider.Thumb className={sliderThumb()} aria-label={label} />
      </RadixSlider.Root>
      {hint && <p className="mbf:text-muted mbf:text-[11px] mbf:leading-snug">{hint}</p>}
    </div>
  );
}

interface ToggleProps {
  label: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, checked, disabled, onChange }: ToggleProps) {
  return (
    <label className={switchRow()}>
      <span>{label}</span>
      <RadixSwitch.Root
        className={switchRoot()}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      >
        <RadixSwitch.Thumb className={switchThumb()} />
      </RadixSwitch.Root>
    </label>
  );
}

/** Wraps the app once so every `Hint` below shares one delay and one portal. */
export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={400}>{children}</RadixTooltip.Provider>
);

export function Hint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          className="mbf:bg-ink mbf:text-ground mbf:z-50 mbf:rounded-md mbf:px-2 mbf:py-1 mbf:text-[11px] mbf:shadow-lg"
        >
          {text}
          <RadixTooltip.Arrow className="mbf:fill-ink" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
