import { BlockDefinition, BlockModel, TextureAtlas, type Resources } from "deepslate";
import type { SchematicAssetsBundle } from "@/services/electron";

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
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

  return {
    getBlockDefinition: (id) => blockDefinitions[id.toString()] ?? null,
    getBlockModel: (id) => blockModels[id.toString()] ?? null,
    getTextureUV: (id) => atlas.getTextureUV(id),
    getTextureAtlas: () => atlas.getTextureAtlas(),
    // No opacity/culling table — every face gets meshed, trading some GPU
    // overdraw for not having to hand-build a transparency table. Matches
    // deepslate's own official demo default.
    getBlockFlags: () => ({ opaque: false }),
    getBlockProperties: () => null,
    getDefaultBlockProperties: () => null,
  };
}
