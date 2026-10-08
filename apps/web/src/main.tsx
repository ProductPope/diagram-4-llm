import { invoke, isTauri } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { openConversationStore } from "./storage/conversation-store";
import { openKeychain } from "./storage/keychain";
import { App } from "./ui/App";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html is missing the #root element.");

const openStore = () => openConversationStore(indexedDB);

// In the desktop app the API key is read from the keychain before the first
// render, so that the settings are complete when the app reads them.
void (isTauri() ? openKeychain(invoke) : Promise.resolve(null)).then(
  (keyStore) => {
    createRoot(root).render(
      <StrictMode>
        <App
          openStore={openStore}
          settingsStorage={localStorage}
          keyStore={keyStore}
        />
      </StrictMode>,
    );
  },
);
