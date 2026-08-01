import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initTheme, useThemeStore } from "./state/themeStore.ts";
import "./index.css";

// Before the first render, so the map is drawn with the right palette rather than
// recoloured a frame later.
initTheme();

/**
 * Labels are drawn into the canvas, which does not re-render itself when a webfont
 * arrives — and `textBounds` measures with it too, so the selection frame would be wrong
 * as well as the glyphs (invariant I2). One redraw once the faces are in.
 */
if (typeof document !== "undefined" && document.fonts) {
  void document.fonts.ready.then(() => useThemeStore.getState().invalidate());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
