import { ImageAnnotatorClient, protos } from "@google-cloud/vision";
import sharp from "sharp";

export type ModerationCategory = "sexual" | "violence";

export interface ModerationVerdict {
  allowed: boolean;
  categories: ModerationCategory[];
  reason: string;
}

/** Image formats the app lets you pick. */
export function sniffImageType(buf: Buffer): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6 && buf.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

const MAX_FRAMES = 4;

/**
 * Normalizes whatever was uploaded into a few JPEGs for Vision: big images are
 * shrunk, tiny ones like 64x64 skins are blown up with nearest-neighbor so the
 * classifier can actually see them, and animated GIF/WebP get several frames
 * sampled — checking only the first frame would let anything through after it.
 */
async function toFrames(buf: Buffer): Promise<Buffer[]> {
  const meta = await sharp(buf, { animated: true }).metadata();
  const pages = Math.max(1, meta.pages ?? 1);
  const indices = pages <= MAX_FRAMES
    ? [...Array(pages).keys()]
    : [...Array(MAX_FRAMES).keys()].map((i) => Math.floor((i * (pages - 1)) / (MAX_FRAMES - 1)));

  const width = meta.width ?? 0;
  const height = meta.pageHeight ?? meta.height ?? 0;
  const tiny = Math.max(width, height) < 256;

  return Promise.all(
    indices.map((page) => {
      const frame = sharp(buf, { page }).flatten({ background: "#808080" });
      const resized = tiny
        ? frame.resize(512, 512, { fit: "inside", kernel: "nearest" })
        : frame.resize(1024, 1024, { fit: "inside", withoutEnlargement: true });
      return resized.jpeg({ quality: 85 }).toBuffer();
    })
  );
}

const Likelihood = protos.google.cloud.vision.v1.Likelihood;
type LikelihoodValue = protos.google.cloud.vision.v1.Likelihood | keyof typeof protos.google.cloud.vision.v1.Likelihood | null | undefined;

function level(value: LikelihoodValue): number {
  if (value == null) return Likelihood.UNKNOWN;
  return typeof value === "number" ? value : Likelihood[value];
}

// SafeSearch gives a likelihood per category rather than a yes/no. "racy"
// covers swimwear and the like, so it only blocks at the very top; "adult"
// and "violence" block from LIKELY up.
function judge(annotation: protos.google.cloud.vision.v1.ISafeSearchAnnotation): ModerationCategory[] {
  const categories: ModerationCategory[] = [];
  if (level(annotation.adult) >= Likelihood.LIKELY || level(annotation.racy) >= Likelihood.VERY_LIKELY) {
    categories.push("sexual");
  }
  if (level(annotation.violence) >= Likelihood.LIKELY) categories.push("violence");
  return categories;
}

let client: ImageAnnotatorClient | null = null;

/** Runs Cloud Vision SafeSearch over the image (every sampled frame, if
 *  animated). Throws if the check itself fails — callers decide whether that
 *  blocks or not. */
export async function moderateImage(buf: Buffer): Promise<ModerationVerdict> {
  client ??= new ImageAnnotatorClient();
  const frames = await toFrames(buf);

  const [result] = await client.batchAnnotateImages({
    requests: frames.map((content) => ({
      image: { content },
      features: [{ type: "SAFE_SEARCH_DETECTION" }],
    })),
  });

  const found = new Set<ModerationCategory>();
  for (const response of result.responses ?? []) {
    if (response.error?.message) throw new Error(`Vision: ${response.error.message}`);
    if (!response.safeSearchAnnotation) throw new Error("Vision: respuesta sin SafeSearch");
    for (const c of judge(response.safeSearchAnnotation)) found.add(c);
  }

  const categories = [...found];
  return {
    allowed: categories.length === 0,
    categories,
    reason: categories.length === 0 ? "" : "La imagen no está permitida.",
  };
}
