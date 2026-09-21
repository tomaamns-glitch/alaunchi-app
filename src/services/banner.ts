import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

/** Bundled fallback shown on any profile that hasn't set its own banner —
 *  relative path (not "/banners/...") so it resolves under both dev (Vite
 *  serving public/ at the root) and the packaged app's file:// index.html. */
export const DEFAULT_PROFILE_BANNER = "./banners/default-profile-banner.png";

/** Backgrounds that ship with the app — always available in the banner picker,
 *  no upload needed. `url` uses the same relative-path convention as
 *  DEFAULT_PROFILE_BANNER. */
export const PRESET_BANNERS: { id: string; label: string; url: string }[] = [
  { id: "default", label: "Predeterminado", url: DEFAULT_PROFILE_BANNER },
];

/** Uploads a profile banner to Firebase Storage under a unique key
 *  (banners/{uuid}/{timestamp}) so past ones survive for the "recientes" list,
 *  and returns its public download URL. Same base64-from-file-picker pattern
 *  skins already use (services/skin.ts's fileToBase64). */
export async function uploadBanner(uuid: string, base64: string, contentType: string): Promise<string> {
  const bannerRef = ref(storage, `banners/${uuid}/${Date.now().toString(36)}`);
  await uploadString(bannerRef, base64, "base64", { contentType });
  return getDownloadURL(bannerRef);
}
