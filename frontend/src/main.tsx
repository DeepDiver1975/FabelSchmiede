import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
// Self-hosted OFL fonts (bundled by Vite — no runtime CDN request):
// Cinzel for display/headings, Alegreya for immersive narration body.
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cinzel/latin-700.css";
import "@fontsource/alegreya/latin-400.css";
import "@fontsource/alegreya/latin-500.css";
import "@fontsource/alegreya/latin-700.css";
import "@fontsource/alegreya/latin-400-italic.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
