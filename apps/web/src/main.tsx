import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { openConversationStore } from "./storage/conversation-store";
import { App } from "./ui/App";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html is missing the #root element.");

const openStore = () => openConversationStore(indexedDB);

createRoot(root).render(
  <StrictMode>
    <App openStore={openStore} settingsStorage={localStorage} />
  </StrictMode>,
);
