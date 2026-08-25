import { Structure, type NbtCompound } from "deepslate";
import { resolveLegacyBlock } from "./schematic-legacy-ids";

/** Parses a legacy MCEdit/WorldEdit .schematic (pre-1.13, numeric block IDs)
 *  NBT root into a deepslate Structure. Only blocks present in the curated
 *  LEGACY_BLOCK_TABLE render — everything else is skipped (empty gap) rather
 *  than guessed at, since there's no verified full ID->modern-block table
 *  available (see schematic-legacy-ids.ts). */
export function parseLegacySchematic(root: NbtCompound): Structure {
  const width = root.getNumber("Width");
  const height = root.getNumber("Height");
  const length = root.getNumber("Length");
  const structure = new Structure([width, height, length]);

  const blocks = root.getByteArray("Blocks").getItems().map((b) => b.getAsNumber() & 0xff);
  const data = root.getByteArray("Data").getItems().map((b) => b.getAsNumber() & 0xff);
  // Extended IDs (256-4095), when present, live in a nibble-packed byte array.
  const addBlocks = root.has("AddBlocks") ? root.getByteArray("AddBlocks").getItems().map((b) => b.getAsNumber() & 0xff) : null;

  const volume = width * height * length;
  for (let i = 0; i < volume; i++) {
    let id = blocks[i] ?? 0;
    if (addBlocks) {
      const nibble = i % 2 === 0 ? addBlocks[i >> 1] & 0x0f : (addBlocks[i >> 1] >> 4) & 0x0f;
      id |= nibble << 8;
    }
    if (id === 0) continue; // air

    const name = resolveLegacyBlock(id, data[i] ?? 0);
    if (!name) continue;

    // MCEdit ordering: (y*Length + z)*Width + x, i.e. Y-major full XZ planes.
    const x = i % width;
    const z = Math.floor(i / width) % length;
    const y = Math.floor(i / (width * length));
    structure.addBlock([x, y, z], name);
  }

  return structure;
}
