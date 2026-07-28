import { useEffect, useState } from "react";
import { MapStage } from "./canvas/MapStage";
import { callGeometry } from "./engine/worker/client";
import type { CanvasPreset } from "./scene/types";
import { useEditorStore } from "./state/editorStore";
import "./App.css";

const PRESETS: CanvasPreset[] = ["landscape", "square", "portrait"];

// ponytail: this rail is a stand-in for the WP-13 toolbar/layer panel. It exists so the
// active layer can be switched — the only interaction WP-1 has to prove.
export default function App() {
  const scene = useEditorStore((s) => s.scene);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const newScene = useEditorStore((s) => s.newScene);
  const [worker, setWorker] = useState("checking…");

  useEffect(() => {
    callGeometry("ping", { echo: "ok" })
      .then((r) => setWorker(`worker: ${r.echo}`))
      .catch((err: Error) => setWorker(`worker failed: ${err.message}`));
  }, []);

  return (
    <main>
      <aside className="rail">
        <h1>map.byfauzi.com</h1>

        <h2>Layers</h2>
        <ul className="layers">
          {[...scene.layers].reverse().map((layer) => (
            <li key={layer.id}>
              <button
                type="button"
                className={layer.id === activeLayerId ? "active" : undefined}
                onClick={() => setActiveLayer(layer.id)}
              >
                {layer.id}
                <span>{layer.id === activeLayerId ? "live" : "cached"}</span>
              </button>
            </li>
          ))}
        </ul>

        <h2>Canvas</h2>
        <div className="presets">
          {PRESETS.map((p) => (
            <label key={p}>
              <input
                type="radio"
                name="preset"
                checked={scene.meta.canvas.preset === p}
                onChange={() => newScene(p)}
              />
              {p}
            </label>
          ))}
        </div>

        <p className="status">
          {scene.meta.canvas.w}×{scene.meta.canvas.h} · schema v{scene.schemaVersion} · {worker}
        </p>
        <p className="status">wheel to zoom · middle-drag or space+drag to pan</p>
      </aside>

      <MapStage />
    </main>
  );
}
