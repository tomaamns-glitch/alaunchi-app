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
    if (!res.ok) return null;
    const data = await res.json();
    const segments = data?.[0];
    if (!Array.isArray(segments)) return null;
    const translated = segments.map((s: any[]) => s?.[0] ?? "").join("");
    return translated.trim() || null;
  } catch {
    return null;
  }
}
