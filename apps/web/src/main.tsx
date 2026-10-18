import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { keepPlayback } from "./playback";
import "./theme.css";
import "./app.css";

keepPlayback();
const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
