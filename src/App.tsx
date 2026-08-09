import { useEffect } from "react";
import { navigate, useRoute } from "./routes";
import { CreatePage } from "./ui/CreatePage";
import { EditorRoute } from "./ui/Editor";
import { MapsPage } from "./ui/MapsPage";

/**
 * The route, and nothing else (`14` §3).
 *
 * Everything the SPA serves lives under `/maps`, so an unknown path here is one Caddy — and
 * the dev middleware that mirrors it — has already decided belongs to the app: `/maps/nonsense`
 * rather than `/mapz`, which never loads this bundle at all. It redirects rather than
 * rendering a second not-found surface (§4.5).
 */
export default function App() {
  const route = useRoute();
  const unknown = route.name === "unknown";

  useEffect(() => {
    if (unknown) void navigate("/maps", { replace: true });
  }, [unknown]);

  if (route.name === "editor") return <EditorRoute id={route.id} />;
  if (route.name === "create") return <CreatePage />;
  return <MapsPage />;
}
