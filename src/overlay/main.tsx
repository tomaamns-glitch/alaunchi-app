import { createRoot } from "react-dom/client";
import "../index.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OverlayApp } from "./overlay-app";

// Entry of overlay.html — the window ALaunchi shows over Minecraft
// (electron/main.js, "OVERLAY EN EL JUEGO"). Kept apart from the main app on
// purpose: no Firebase, auth or presence here, so it opens instantly.
// (The tooltip provider is what the icon buttons' name tags — Hint — need.)
createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <OverlayApp />
  </TooltipProvider>
);
