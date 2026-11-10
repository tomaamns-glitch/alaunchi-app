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

const ICON_SIZE = 256;

/**
 * Turns an icon into a PNG data URL for the instance meta: big ones down to
 * ICON_SIZE; small ones up by a whole factor without smoothing, so pixel art stays
 * sharp at the sizes the app shows it (the browser would blur it otherwise).
 */
async function iconToDataUrl(url: string): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const longest = Math.max(bmp.width, bmp.height);
    const scale = longest >= ICON_SIZE ? ICON_SIZE / longest : Math.floor(ICON_SIZE / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

/** A project's icon from its original upload (`iconUrl` is a 96px thumbnail). */
export async function fetchModrinthIcon(projectId: string, iconUrl: string | null): Promise<string | undefined> {
  const detail = await getProjectDetail(projectId);
  const original = detail?.rawIconUrl ? await iconToDataUrl(detail.rawIconUrl) : undefined;
  return original ?? (iconUrl ? iconToDataUrl(iconUrl) : undefined);
}

function imageWidth(src: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth);
    img.onerror = () => resolve(0);
    img.src = src;
  });
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

const iconAttempted = new Set<string>();

/**
 * Replaces the 96px icon older installs saved with the project's original. Exactly
 * 96px wide is how those are told apart: an icon chosen by hand is saved at 256px,
 * and this one never comes out at 96 (see iconToDataUrl), so it only runs once.
 * Resolves to true if any instance got a new icon.
 */
export async function backfillModrinthIcons(metas: Record<string, any>[]): Promise<boolean> {
  let changed = false;
  for (const meta of metas) {
    const projectId = meta?.importedFrom?.type === "modrinth" ? meta.importedFrom.projectId : null;
    if (!projectId || meta.source !== "custom" || !meta.iconDataUrl) continue;
    if (iconAttempted.has(meta.id)) continue;
    iconAttempted.add(meta.id);
    try {
      if ((await imageWidth(meta.iconDataUrl)) !== 96) continue;
      const detail = await getProjectDetail(projectId);
      const icon = detail?.rawIconUrl ? await iconToDataUrl(detail.rawIconUrl) : undefined;
      if (!icon) continue;
      await updateInstanceSettings({ id: meta.id, iconDataUrl: icon });
      changed = true;
    } catch {
      // Deleted meanwhile, or the write failed: nothing to show for it.
    }
  }
  return changed;
}
