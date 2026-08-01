import { X } from "lucide-react";
import { useToastStore } from "../state/toastStore";
import { button, iconButton, toast } from "./variants";

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      className="toasts mbf:pointer-events-none mbf:fixed mbf:bottom-10 mbf:left-1/2 mbf:z-50 mbf:flex mbf:-translate-x-1/2 mbf:flex-col mbf:gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((entry) => (
        <div key={entry.id} className={`toast ${toast()}`}>
          <span>{entry.message}</span>
          {entry.undo && (
            <button
              type="button"
              className={button({ tone: "ghost" })}
              onClick={() => {
                entry.undo?.();
                dismiss(entry.id);
              }}
            >
              Undo
            </button>
          )}
          <button
            type="button"
            className={`close ${iconButton()}`}
            aria-label="Dismiss"
            onClick={() => dismiss(entry.id)}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
