import { invoke, isTauri } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { Desktop } from "./app/settings";
import { desktopFetch } from "./providers/desktop-fetch";
import { openConversationStore } from "./storage/conversation-store";
import { openKeychain } from "./storage/keychain";
import { App } from "./ui/App";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html is missing the #root element.");

const openStore = () => openConversationStore(indexedDB);

// In the desktop app the API key is read from the keychain before the first
// render, so that the settings are complete when the app reads them.
const desktop: Promise<Desktop | null> = isTauri()
  ? openKeychain(invoke).then((keyStore) => ({
      keyStore,
      serverFetch: desktopFetch,
    }))
  : Promise.resolve(null);

void desktop.then((found) => {
  createRoot(root).render(
    <StrictMode>
      <App
        openStore={openStore}
        settingsStorage={localStorage}
        desktop={found}
      />
    </StrictMode>,
  );
});
