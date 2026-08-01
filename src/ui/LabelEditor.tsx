import { useEffect, useRef, useState } from "react";

interface Props {
  /** where to sit inside the stage container, in CSS pixels */
  at: { x: number; y: number };
  value: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * Naming a place, on the map, where the name will be.
 *
 * This replaces the native text prompt P0 shipped with, which put a browser chrome box at
 * the top of the screen for something whose whole point is *where it is*, and blocked the
 * main thread — the canvas underneath stopped rendering while you typed.
 *
 * Deliberately not a Radix Dialog. A dialog traps focus and dims the page, which is right
 * for a decision and wrong for a caption: you want to see the coastline you are naming.
 */
export function LabelEditor({ at, value, onCommit, onCancel }: Props) {
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const commit = () => {
    const trimmed = text.trim();
    // An empty label is an invisible, unclickable object — treat it as backing out.
    if (trimmed) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={input}
      data-label-editor
      aria-label="Label text"
      value={text}
      placeholder="Name this place…"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // The canvas listens for Delete and Escape; typing a name is not a map gesture.
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onCancel();
      }}
      className={
        "mbf:bg-panel mbf:border-accent mbf:text-ink mbf:font-display mbf:absolute mbf:z-30 mbf:w-56 " +
        "mbf:-translate-x-1/2 mbf:-translate-y-1/2 mbf:rounded-md mbf:border mbf:px-2 mbf:py-1 " +
        "mbf:text-sm mbf:shadow-lg mbf:outline-none"
      }
      style={{ left: at.x, top: at.y }}
    />
  );
}
