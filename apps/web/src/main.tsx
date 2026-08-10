import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@polo/ui/src/tokens.css";
import "./index.css";
import { App } from "./App.js";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("No se encontró el elemento #root en index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
