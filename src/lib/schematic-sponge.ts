import { BlockState, Structure, type NbtByteArray, type NbtCompound } from "deepslate";

/** Standard protocol VarInt (7 bits per byte, high bit = continuation) — used
 *  by the Sponge Schematic format's block data array. */
function readVarInts(bytes: Uint8Array, count: number): number[] {
  const out: number[] = [];
  let pos = 0;
  for (let n = 0; n < count; n++) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = bytes[pos++];
      result |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    out.push(result);
  }
  return out;
}

function readBlockContainer(
  width: number,
  height: number,
  length: number,
  paletteTag: NbtCompound,
  dataTag: NbtByteArray
): Structure {
  const structure = new Structure([width, height, length]);

  const indexToState = new Map<number, BlockState>();
  paletteTag.forEach((key, value) => {
    indexToState.set(value.getAsNumber(), BlockState.parse(key));
  });

  const data = dataTag.getItems().map((b) => b.getAsNumber() & 0xff);
  const volume = width * height * length;
  const indices = readVarInts(new Uint8Array(data), volume);

  let i = 0;
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++, i++) {
        const state = indexToState.get(indices[i]);
        if (!state || state.is("minecraft:air")) continue;
        structure.addBlock([x, y, z], state.getName().toString(), state.getProperties());
      }
    }
  }

  return structure;
}

/** Parses a Sponge Schematic (.schem) NBT root — versions 1/2 (Palette/BlockData
 *  fields directly on the root) and 3 (wrapped in a "Schematic" compound, with
 *  block data nested one level further under "Blocks" as Palette/Data — a
 *  different field name than v1/v2's "BlockData") both supported. */
export function parseSpongeSchematic(root: NbtCompound): Structure {
  const body = root.hasCompound("Schematic") ? root.getCompound("Schematic") : root;
  const width = body.getNumber("Width");
  const height = body.getNumber("Height");
  const length = body.getNumber("Length");

  const isV3 = body.hasCompound("Blocks");
  const blocks = isV3 ? body.getCompound("Blocks") : body;
  const paletteTag = blocks.getCompound("Palette");
  const dataTag = isV3 ? blocks.getByteArray("Data") : blocks.getByteArray("BlockData");

  return readBlockContainer(width, height, length, paletteTag, dataTag);
}
