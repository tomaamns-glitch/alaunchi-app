import { extractDominantColor } from "@/lib/dominant-color";

// Thin wrapper around extractDominantColor for coloring a single detached UI
// element (a chat message's instance tag, the "Jugando a X" status) — NOT for
// theming the whole app, which is what useDynamicAccent (src/hooks/use-dynamic-accent.ts)
// does by mutating the global --accent CSS variable. Reusing that hook here
// would repaint the entire launcher's theme every time a carousel-instance
// message renders, which is not what either caller wants.
const colorCache = new Map<string, Promise<string>>();

const FALLBACK_COLOR = "hsl(205 90% 55%)"; // matches --accent's default in index.css

/** Resolves (and caches, per instance id) a ready-to-use `hsl(...)` string
 *  for the given instance's banner/icon — the same dominant-color extraction
 *  useDynamicAccent uses, just scoped to one element via inline style instead
 *  of the global theme. */
export function getInstanceAccentColor(instance: { id: string; imageUrl?: string | null }): Promise<string> {
  const cached = colorCache.get(instance.id);
  if (cached) return cached;

  const promise = extractDominantColor(instance.imageUrl).then((hsl) =>
    hsl ? `hsl(${hsl.h.toFixed(1)} ${hsl.s.toFixed(1)}% ${hsl.l.toFixed(1)}%)` : FALLBACK_COLOR
  );
  colorCache.set(instance.id, promise);
  return promise;
}
