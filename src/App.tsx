import { useEffect, useMemo, useState } from "react";
import { callGeometry } from "./engine/worker/client";
import { createEmptyScene } from "./scene/scene";
import type { CanvasPreset } from "./scene/types";
import "./App.css";

const PRESETS: CanvasPreset[] = ["landscape", "square", "portrait"];

// ponytail: the canvas is a plain sized box here. WP-1 replaces it with the Konva stage,
// viewport and cached layers — WP-0 only has to boot to an empty canvas of the preset.
export default function App() {
  const [preset, setPreset] = useState<CanvasPreset>("landscape");
  const scene = useMemo(() => createEmptyScene(preset), [preset]);
  const [worker, setWorker] = useState("checking…");

  useEffect(() => {
    callGeometry("ping", { echo: "ok" })
      .then((r) => setWorker(`geometry worker: ${r.echo}`))
      .catch((err: Error) => setWorker(`geometry worker failed: ${err.message}`));
  }, []);

  const { w, h } = scene.meta.canvas;
  const fit = Math.min(760 / w, 500 / h);

  return (
    <main>
      <h1>map.byfauzi.com</h1>
      <div className="presets">
        {PRESETS.map((p) => (
          <label key={p}>
            <input type="radio" checked={preset === p} onChange={() => setPreset(p)} />
            {p}
          </label>
        ))}
      </div>
      <div className="canvas" style={{ width: w * fit, height: h * fit }} />
      <p className="status">
        {w}×{h} · {scene.layers.length} layers · schema v{scene.schemaVersion} · {worker}
      </p>
    </main>
  );
}
