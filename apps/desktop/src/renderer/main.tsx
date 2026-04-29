import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { useJobsStore } from "./state/useJobsStore.js";
import { useGalleryStore } from "./state/useGalleryStore.js";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Renderer mount point #root not found");
}

// Wire push-event subscriptions ONCE at boot. The unsubscribe handles never
// fire — the renderer lives for the lifetime of the window.
useJobsStore.getState().bindEvents();
useGalleryStore.getState().bindEvents();

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
