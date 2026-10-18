import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { keepVolume } from "./volume";
import "./theme.css";
import "./app.css";

keepVolume();
const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
