/**
 * Free, keyless translation via Google's public "gtx" endpoint — the same one
 * browser extensions use for on-the-fly translation. No API key/config needed,
 * but it's unofficial: treat failures as expected and always fall back to the
 * original text rather than blocking the UI on it.
 */
export async function translateToSpanish(text: string): Promise<string | null> {
  if (!text.trim()) return null;
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(text)}`
    );
    if (!res.ok) {
      console.warn(`[translate] Respuesta no-ok de Google Translate: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const segments = data?.[0];
    if (!Array.isArray(segments)) {
      console.warn("[translate] Respuesta con forma inesperada:", data);
      return null;
    }
    const translated = segments.map((s: any[]) => s?.[0] ?? "").join("");
    return translated.trim() || null;
  } catch (e: any) {
    console.warn("[translate] Fallo de red/fetch:", e?.message ?? e);
    return null;
  }
}

const HTML_TAG_RE = /(<[^>]+>)/g;

/**
 * Translates text that may have raw HTML tags embedded in it (common in mod
 * descriptions — badge rows, `<img>`/`<br>`, `<details>`...) without mangling
 * the markup. Splits on tag boundaries, translates only the text runs between
 * tags, and stitches the tags back in verbatim. A run that fails to translate
 * falls back to its original text rather than failing the whole description.
 */
export async function translateHtmlAwareToSpanish(text: string): Promise<string | null> {
  if (!text.trim()) return null;
  const parts = text.split(HTML_TAG_RE);
  const isTag = (part: string) => /^<[^>]+>$/.test(part);

  const translations = await Promise.all(
    parts.map((part) => (isTag(part) || !part.trim() ? null : translateToSpanish(part)))
  );

  if (translations.every((t) => t === null)) return null;
  // Google trims leading/trailing whitespace off each translated run — reapply
  // the original run's own whitespace envelope so blank lines between markdown
  // blocks (e.g. before a heading) survive instead of collapsing into one line.
  return parts
    .map((part, i) => {
      const translated = translations[i];
      if (translated === null) return part;
      const leading = part.match(/^\s*/)?.[0] ?? "";
      const trailing = part.match(/\s*$/)?.[0] ?? "";
      return leading + translated + trailing;
    })
    .join("");
}
