import { useSyncExternalStore } from "react";
import { getLoaderIcons, type LoaderIcons } from "@/services/electron";

/**
 * Modloader / Minecraft marks for the instance tiles.
 *
 * Priority per loader:
 *  1. a file you drop in `src/assets/loaders/` (`forge`, `neoforge`, `fabric`,
 *     `minecraft` — `.png` / `.svg` / `.webp`) — an explicit choice wins;
 *  2. the real logo pulled out of the jar the launcher already downloaded for
 *     it (fabric-loader, neoforge, forge, a vanilla client for Minecraft) —
 *     nothing bundled, same as the schematic / cherry-petal extraction;
 *  3. a small hand-drawn glyph.
 */

const logoModules = import.meta.glob("../assets/loaders/*.{png,svg,webp,jpg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const FILE_LOGOS: Record<string, string> = {};
for (const [path, url] of Object.entries(logoModules)) {
  const name = path.split("/").pop()!.replace(/\.\w+$/, "").toLowerCase();
  FILE_LOGOS[name] = url;
}
if (FILE_LOGOS.minecraft && !FILE_LOGOS.vanilla) FILE_LOGOS.vanilla = FILE_LOGOS.minecraft;
if (FILE_LOGOS.vanilla && !FILE_LOGOS.minecraft) FILE_LOGOS.minecraft = FILE_LOGOS.vanilla;

// Icons extracted from the local jars — fetched once, lazily, the first time a
// LoaderIcon mounts. A tiny external store so every instance re-renders when
// they arrive.
let jarIcons: LoaderIcons = { minecraft: null, fabric: null, forge: null, neoforge: null };
let fetched = false;
const listeners = new Set<() => void>();

function ensureJarIcons() {
  if (fetched) return;
  fetched = true;
  getLoaderIcons().then((icons) => {
    jarIcons = icons;
    listeners.forEach((l) => l());
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  ensureJarIcons();
  return () => listeners.delete(l);
}

function extractedFor(loader: string): string | null {
  if (loader === "vanilla" || loader === "minecraft") return jarIcons.minecraft;
  if (loader === "fabric") return jarIcons.fabric;
  if (loader === "neoforge") return jarIcons.neoforge;
  if (loader === "forge") return jarIcons.forge;
  return null;
}

interface LoaderIconProps {
  loader: string | null | undefined;
  className?: string;
  title?: string;
}

export function LoaderIcon({ loader, className = "h-3.5 w-3.5", title }: LoaderIconProps) {
  const icons = useSyncExternalStore(subscribe, () => jarIcons);
  const l = (loader || "vanilla").toLowerCase();
  const label = title ?? (loader ? loader[0].toUpperCase() + loader.slice(1) : "Vanilla");

  const src = FILE_LOGOS[l] || (l === "vanilla" || l === "minecraft" ? icons.minecraft : extractedFor(l));
  if (src) {
    // Height comes from `className`; width is left free (inline beats the class)
    // so a wide wordmark logo isn't squashed into a square.
    return (
      <img
        src={src}
        alt={label}
        draggable={false}
        className={`${className} object-contain`}
        style={{ width: "auto", maxWidth: 72 }}
      />
    );
  }

  if (l === "fabric") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" role="img" aria-label={label}>
        <rect x="6" y="3.5" width="12" height="2.4" rx="1" />
        <rect x="6" y="18.1" width="12" height="2.4" rx="1" />
        <rect x="9" y="5.5" width="6" height="13" rx="1.2" />
        <path d="M15 8.4c3 1 3 3.6 0 4.6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    );
  }

  if (l === "forge" || l === "neoforge") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" role="img" aria-label={label}>
        {l === "neoforge" && <path d="M18.5 3c1.4 1.7 1.7 3.3.6 4.6-.7.8-2 .7-2.4-.2-.6-1.3.3-2.6 1.8-4.4z" />}
        <path d="M3 7.2h15.6c1 0 1.7.9 1.3 1.8l-.9 2.1c-.3.6-.9 1-1.5 1H15v2.1H9v-2.1H4.4c-.8 0-1.4-.7-1.2-1.5l.7-2.6c.1-.5.6-.9 1.1-.9z" />
        <path d="M6.2 16h11.6l1.7 3.6c.3.7-.2 1.4-.9 1.4H5.4c-.8 0-1.3-.8-.9-1.5z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={label}>
      <rect x="3.5" y="4" width="17" height="16" rx="2" fill="#7a4f33" />
      <path d="M3.5 6.2A2.2 2.2 0 015.7 4h12.6a2.2 2.2 0 012.2 2.2v3.3H3.5z" fill="#5fa544" />
      <rect x="6.5" y="12" width="2.4" height="2.4" rx=".5" fill="#000" opacity="0.16" />
      <rect x="13.2" y="15" width="2.4" height="2.4" rx=".5" fill="#000" opacity="0.16" />
      <rect x="10.5" y="9.5" width="2" height="2" rx=".4" fill="#4c8a37" />
    </svg>
  );
}
