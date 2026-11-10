import { uploadModeratedBanner } from "@/services/image-moderation";

/** Bundled fallback shown on any profile that hasn't set its own banner —
 *  relative path (not "/banners/...") so it resolves under both dev (Vite
 *  serving public/ at the root) and the packaged app's file:// index.html. */
export const DEFAULT_PROFILE_BANNER = "./banners/default-profile-banner.png";

/** Backgrounds that ship with the app — always available in the banner picker,
 *  no upload needed. `url` uses the same relative-path convention as
 *  DEFAULT_PROFILE_BANNER. */
export const PRESET_BANNERS: { id: string; label: string; url: string }[] = [
  { id: "default", label: "Predeterminado", url: DEFAULT_PROFILE_BANNER },
  { id: "night-sky", label: "Noche estrellada", url: "./banners/night-sky.webp" },
  { id: "violet-sky", label: "Cielo violeta", url: "./banners/violet-sky.webp" },
  { id: "river-sunset", label: "Atardecer en el río", url: "./banners/river-sunset.webp" },
  { id: "nether", label: "Nether", url: "./banners/nether.webp" },
  { id: "the-end", label: "El End", url: "./banners/the-end.webp" },
  { id: "ocean-ruins", label: "Ruinas submarinas", url: "./banners/ocean-ruins.webp" },
  { id: "lush-cave", label: "Cueva frondosa", url: "./banners/lush-cave.webp" },
  { id: "snowy-aurora", label: "Aurora nevada", url: "./banners/snowy-aurora.webp" },
  { id: "cherry-grove", label: "Cerezos", url: "./banners/cherry-grove.webp" },
  // The animated presets (video-neon / video-blocks / video-portal) are no
  // longer offered, but their files stay in public/banners: profiles that
  // already use one keep showing it.
];

/** Video banners (the animated presets) are drawn with a <video>, see BannerMedia. */
export function isVideoBanner(url: string | null | undefined): boolean {
  return !!url && /\.(mp4|webm)(\?|#|$)/i.test(url);
}

/** Uploads a profile banner to Firebase Storage under a unique key
 *  (banners/{uuid}/{timestamp}) so past ones survive for the "recientes" list,
 *  and returns its public download URL. Goes through content moderation first
 *  (services/image-moderation.ts) — throws a user-facing error if rejected. */
export async function uploadBanner(uuid: string, base64: string): Promise<string> {
  return uploadModeratedBanner(uuid, base64);
}
