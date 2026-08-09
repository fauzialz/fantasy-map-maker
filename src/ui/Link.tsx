import type { AnchorHTMLAttributes } from "react";
import { navigate } from "../routes";

/**
 * Every navigation is a real link (`14` §4.6).
 *
 * A real `<a href>` is what makes middle-click, Ctrl/Cmd-click and *Open in new tab* work —
 * those must reach the browser untouched, so the modified-click test comes first and the
 * `preventDefault` never runs. The new tab needs no autosave flush: this tab stays open and
 * keeps saving.
 */
export function Link({
  to,
  replace,
  ...rest
}: { to: string; replace?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(event) => {
        rest.onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        void navigate(to, { replace });
      }}
    />
  );
}
