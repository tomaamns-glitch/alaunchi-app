import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initErrorReporter } from "./services/error-reporter";
import { initPresenceSync } from "./services/presence-sync";

initErrorReporter();
initPresenceSync();

createRoot(document.getElementById("root")!).render(<App />);
