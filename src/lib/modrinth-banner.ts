import { getProjectDetail } from "@/services/modrinth";
import { updateInstanceSettings } from "@/services/electron";

const BANNER_MAX_WIDTH = 1280;

/** Turns a remote gallery image into a JPEG data URL small enough for the instance meta. */
async function imageToDataUrl(url: string): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const scale = Math.min(1, BANNER_MAX_WIDTH / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return undefined;
  }
}

/**
 * The banner for a Modrinth modpack: its gallery's featured image, or the first
 * one. null = the project has no images; undefined = couldn't be fetched.
 */
export async function fetchModrinthBanner(projectId: string): Promise<string | null | undefined> {
  const detail = await getProjectDetail(projectId);
  if (!detail) return undefined;
  const image = detail.gallery.find((g) => g.featured) ?? detail.gallery[0];
  if (!image) return null;
  return imageToDataUrl(image.rawUrl || image.url);
}

// One try per session: a network failure leaves the instance unmarked, so it's
// retried the next time the app opens rather than on every catalog reload.
const attempted = new Set<string>();

/**
 * Gives Modrinth instances without a banner their project's gallery image.
 * `bannerChecked` (set by main.js on install and whenever the banner is changed
 * by hand) keeps it from undoing a banner the player removed.
 * Resolves to true if any instance got a new banner.
 */
export async function backfillModrinthBanners(metas: Record<string, any>[]): Promise<boolean> {
  let changed = false;
  for (const meta of metas) {
    const projectId = meta?.importedFrom?.type === "modrinth" ? meta.importedFrom.projectId : null;
    if (!projectId || meta.source !== "custom" || meta.bannerDataUrl || meta.bannerChecked || meta.duplicatedFrom) continue;
    if (attempted.has(meta.id)) continue;
    attempted.add(meta.id);
    try {
      const banner = await fetchModrinthBanner(projectId);
      if (banner === undefined) continue;
      await updateInstanceSettings({ id: meta.id, bannerDataUrl: banner });
      if (banner) changed = true;
    } catch {
      // Deleted meanwhile, or the write failed: nothing to show for it.
    }
  }
  return changed;
}
