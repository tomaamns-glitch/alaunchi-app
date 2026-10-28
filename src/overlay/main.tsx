import { createRoot } from "react-dom/client";
import "../index.css";
import { OverlayApp } from "./overlay-app";

// Entry of overlay.html — the window ALaunchi shows over Minecraft
// (electron/main.js, "OVERLAY EN EL JUEGO"). Kept apart from the main app on
// purpose: no Firebase, auth or presence here, so it opens instantly.
createRoot(document.getElementById("root")!).render(<OverlayApp />);
