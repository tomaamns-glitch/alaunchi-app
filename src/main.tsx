import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initErrorReporter } from "./services/error-reporter";
import { initPresenceSync } from "./services/presence-sync";
import { initSecureStore } from "./lib/secure-store";

initErrorReporter();
initPresenceSync();

// Tokens (GitHub sources) are read synchronously all over the app — load the
// encrypted store before the first render so nothing sees them as missing.
initSecureStore().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
