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
  // Animated presets: free Pexels videos (Pexels License — see
  // public/banners/NOTICE.md), cut down to small 960×540/640×360 loops.
  { id: "video-neon", label: "Luces de neón", url: "./banners/video-neon.mp4" },
  { id: "video-blocks", label: "Bloques", url: "./banners/video-blocks.webm" },
  { id: "video-portal", label: "Portal de luz", url: "./banners/video-portal.webm" },
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
