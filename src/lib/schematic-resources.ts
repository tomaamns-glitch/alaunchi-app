import { BlockDefinition, BlockModel, TextureAtlas, type Resources } from "deepslate";
import type { SchematicAssetsBundle } from "@/services/electron";

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

type Json = Record<string, any>;

const withNs = (id: string) => (id.includes(":") ? id : `minecraft:${id}`);

// Blocks that are full cubes but see-through: hiding the faces next to them
// would leave holes. Checked against the block id and its textures.
const SEE_THROUGH = /glass|leaves|ice|slime|honey|barrier|spawner|beacon|cobweb|scaffolding|mangrove_roots|vault|trial_spawner/;

/** True when a model (following its parents) is exactly one full 16×16×16
 *  element with all six faces, not rotated, and not cutout/translucent. */
function isFullCubeModel(models: Record<string, unknown>, id: string): boolean {
  let model = models[withNs(id)] as Json | undefined;
  let elements: Json[] | undefined;
  let renderType: string | undefined;
  const textures: string[] = [];
  for (let depth = 0; model && depth < 16; depth++) {
    renderType ??= model.render_type;
    if (model.textures) textures.push(...Object.values(model.textures as Record<string, string>));
    if (!elements && Array.isArray(model.elements)) elements = model.elements;
    if (!model.parent) break;
    model = models[withNs(model.parent)] as Json | undefined;
  }
  if (renderType && !/solid/.test(renderType)) return false;
  if (textures.some((t) => SEE_THROUGH.test(t))) return false;
  if (!elements || elements.length !== 1) return false;
  const [e] = elements;
  const full = (v: unknown, n: number) => Array.isArray(v) && v.every((c) => c === n);
  if (!full(e.from, 0) || !full(e.to, 16) || e.rotation) return false;
  const faces = e.faces ?? {};
  return ["down", "up", "north", "south", "west", "east"].every((f) => !!faces[f]);
}

/** Every model a blockstates file can use (variants and multipart). */
function modelsOf(blockstate: Json): string[] {
  const out: string[] = [];
  const take = (v: unknown) => {
    for (const m of Array.isArray(v) ? v : [v]) if (m && typeof (m as Json).model === "string") out.push((m as Json).model);
  };
  if (blockstate.variants) Object.values(blockstate.variants).forEach(take);
  if (Array.isArray(blockstate.multipart)) blockstate.multipart.forEach((part: Json) => take(part.apply));
  return out;
}

/** Blocks whose every model is an opaque full cube — their neighbours' touching
 *  faces can be skipped. Without this every face of every block got meshed: a
 *  ~44k-block redstone farm went past a million faces and froze the app. */
function opaqueBlocks(bundle: SchematicAssetsBundle): Set<string> {
  const opaque = new Set<string>();
  for (const [id, json] of Object.entries(bundle.blockstates)) {
    if (SEE_THROUGH.test(id)) continue;
    const models = modelsOf(json as Json);
    if (models.length > 0 && models.every((m) => isFullCubeModel(bundle.models, m))) opaque.add(withNs(id));
  }
  return opaque;
}

/** Builds a deepslate Resources object (blockstates, models, texture atlas)
 *  from a raw asset bundle extracted from a Minecraft version's vanilla client
 *  jar. Blocks from mods (not in the vanilla jar) simply have no definition —
 *  deepslate skips them silently rather than crashing. */
export async function buildSchematicResources(bundle: SchematicAssetsBundle): Promise<Resources> {
  const blockDefinitions: Record<string, BlockDefinition> = {};
  for (const [id, json] of Object.entries(bundle.blockstates)) {
    blockDefinitions[id] = BlockDefinition.fromJson(json);
  }

  const blockModels: Record<string, BlockModel> = {};
  for (const [id, json] of Object.entries(bundle.models)) {
    blockModels[id] = BlockModel.fromJson(json);
  }
  // Resolves `parent` chains (e.g. cube_all -> cube -> block/block) now, once,
  // rather than re-walking them on every mesh build.
  for (const model of Object.values(blockModels)) {
    model.flatten({ getBlockModel: (id) => blockModels[id.toString()] ?? null });
  }

  const textureBlobs: Record<string, Blob> = {};
  for (const [id, base64] of Object.entries(bundle.textures)) {
    textureBlobs[id] = base64ToBlob(base64);
  }
  const atlas = await TextureAtlas.fromBlobs(textureBlobs);
  const opaque = opaqueBlocks(bundle);

  return {
    getBlockDefinition: (id) => blockDefinitions[id.toString()] ?? null,
    getBlockModel: (id) => blockModels[id.toString()] ?? null,
    getTextureUV: (id) => atlas.getTextureUV(id),
    getTextureAtlas: () => atlas.getTextureAtlas(),
    // Faces touching an opaque full cube are hidden (see opaqueBlocks).
    getBlockFlags: (id) => ({ opaque: opaque.has(id.toString()) }),
    getBlockProperties: () => null,
    getDefaultBlockProperties: () => null,
  };
}
