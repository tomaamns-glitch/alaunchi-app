import { BlockState, Structure, type NbtCompound } from "deepslate";

// Litematica's own bit-packing (LitematicaBitArray.java) — entries are packed
// contiguously and MAY straddle a 64-bit long boundary, unlike vanilla's
// post-1.16 chunk section format which pads to avoid that. bitsPerEntry is
// max(2, bit-length of (paletteSize-1)) — confirmed against
// LitematicaBlockStateContainer.java's setBits(): `Math.max(2, Integer.SIZE -
// Integer.numberOfLeadingZeros(palette.size() - 1))`. A well-known reference
// JS implementation of this format skips the "minimum 2 bits" clamp, which
// silently corrupts reads for any palette of 2-3 entries — a very common size
// for simple builds.
function bitsPerEntry(paletteSize: number): number {
  const n = Math.max(paletteSize - 1, 0);
  const bits = n === 0 ? 0 : 32 - Math.clz32(n);
  return Math.max(2, bits);
}

/** Reads one packed entry from Litematica's long-array bit storage. Longs are
 *  converted to unsigned 64-bit BigInts up front so `>>`/`<<` behave like
 *  Java's unsigned `>>>` (a signed-negative long's sign bit must not get
 *  sign-extended across the shift). Mirrors LitematicaBitArray.getAt() exactly. */
function makeBitArrayReader(longs: bigint[], bits: number) {
  const mask = (1n << BigInt(bits)) - 1n;
  return (index: number): number => {
    const startOffset = BigInt(index) * BigInt(bits);
    const startArrIndex = Number(startOffset >> 6n);
    const endArrIndex = Number(((BigInt(index) + 1n) * BigInt(bits) - 1n) >> 6n);
    const startBitOffset = startOffset & 0x3fn;
    if (startArrIndex === endArrIndex) {
      return Number((longs[startArrIndex] >> startBitOffset) & mask);
    }
    const endOffset = 64n - startBitOffset;
    return Number(((longs[startArrIndex] >> startBitOffset) | (longs[endArrIndex] << endOffset)) & mask);
  };
}

interface RegionBox {
  /** World-space origin (already resolved from Position/Size, sign-normalized). */
  origin: [number, number, number];
  /** Absolute size along each axis — also the local block-grid dimensions. */
  size: [number, number, number];
  palette: BlockState[];
  readAt: (index: number) => number;
}

function readRegion(region: NbtCompound): RegionBox {
  const pos = region.getCompound("Position");
  const size = region.getCompound("Size");
  const rawPos: [number, number, number] = [pos.getNumber("x"), pos.getNumber("y"), pos.getNumber("z")];
  const rawSize: [number, number, number] = [size.getNumber("x"), size.getNumber("y"), size.getNumber("z")];

  // A negative Size means the region extends in the negative direction from
  // Position — normalize to a positive-size box anchored at its true minimum
  // corner instead of naively Math.abs()-ing the dimensions and leaving the
  // origin wrong (the bug that breaks multi-region litematics in the wild).
  const origin: [number, number, number] = [0, 0, 0];
  const absSize: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (rawSize[i] < 0) {
      origin[i] = rawPos[i] + rawSize[i] + 1;
      absSize[i] = -rawSize[i];
    } else {
      origin[i] = rawPos[i];
      absSize[i] = rawSize[i];
    }
  }

  const paletteTag = region.getList("BlockStatePalette", 10);
  const palette = paletteTag.map((tag) => BlockState.fromNbt(tag));

  const volume = absSize[0] * absSize[1] * absSize[2];
  const bits = bitsPerEntry(palette.length);
  const longs = region.getLongArray("BlockStates").getItems().map((l) => BigInt.asUintN(64, l.toBigInt()));
  const bitReader = makeBitArrayReader(longs, bits);

  return { origin, size: absSize, palette, readAt: (i) => (i < volume ? bitReader(i) : 0) };
}

/** Parses a Litematica (.litematic) NBT root into a deepslate Structure,
 *  compositing every region into one combined structure sized to their
 *  union bounding box, each placed at its correct relative offset. */
export function parseLitematic(root: NbtCompound): Structure {
  const regionsTag = root.getCompound("Regions");
  const regions: RegionBox[] = [];
  regionsTag.forEach((_name, tag) => {
    regions.push(readRegion(tag as NbtCompound));
  });
  if (regions.length === 0) return new Structure([1, 1, 1]);

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const r of regions) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], r.origin[i]);
      max[i] = Math.max(max[i], r.origin[i] + r.size[i]);
    }
  }
  const structureSize: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const structure = new Structure(structureSize);

  for (const region of regions) {
    const [sx, sy, sz] = region.size;
    const offset: [number, number, number] = [region.origin[0] - min[0], region.origin[1] - min[1], region.origin[2] - min[2]];
    let index = 0;
    for (let y = 0; y < sy; y++) {
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++, index++) {
          const paletteIndex = region.readAt(index);
          const state = region.palette[paletteIndex];
          if (!state || state.is("minecraft:air")) continue;
          structure.addBlock(
            [offset[0] + x, offset[1] + y, offset[2] + z],
            state.getName().toString(),
            state.getProperties()
          );
        }
      }
    }
  }

  return structure;
}
