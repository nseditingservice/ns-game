import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./index.css";
import App from "./App";
import { StoreProvider } from "./store";
import { SyncProvider } from "./sync";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <SyncProvider>
        <App />
      </SyncProvider>
    </StoreProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("./sw.js"));
}
