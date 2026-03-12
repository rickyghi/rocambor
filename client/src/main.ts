import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

function bootstrap(): void {
  const app = document.getElementById("app");
  if (!app) {
    console.error("[main] #app element not found");
    return;
  }

  createRoot(app).render(createElement(App));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
