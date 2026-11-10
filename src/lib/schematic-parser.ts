import { NbtFile, Structure, type NbtCompound } from "deepslate";
import { parseLitematic } from "./schematic-litematic";
import { parseSpongeSchematic } from "./schematic-sponge";
import { parseLegacySchematic } from "./schematic-legacy";

/** Cells (width × height × length, empty ones too) a schematic may span before
 *  it's refused unread: every format walks each cell on the main thread, so a
 *  huge box would hang the app before anything could be shown. ~200³. */
export const MAX_SCHEMATIC_VOLUME = 8_000_000;
/** Compressed file size refused before even decoding it. */
export const MAX_SCHEMATIC_BYTES = 40 * 1024 * 1024;

/** A schematic too big to preview — its message is ready to show as is. */
export class SchematicTooLargeError extends Error {}

const fmt = (n: number) => n.toLocaleString("es-ES");

function tooLarge(size: number[]): never {
  throw new SchematicTooLargeError(
    `Esta construcción es demasiado grande para previsualizarla (${size.map(fmt).join(" × ")} bloques).`
  );
}

/** Width × height × length a format declares, read from the header only. */
function declaredSize(root: NbtCompound, ext: string): number[] {
  const abs = (c: NbtCompound) => [Math.abs(c.getNumber("x")), Math.abs(c.getNumber("y")), Math.abs(c.getNumber("z"))];
  switch (ext) {
    case ".litematic": {
      // The regions' union box: the parser builds one structure that spans it.
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      root.getCompound("Regions").forEach((_n, tag) => {
        const region = tag as NbtCompound;
        const pos = region.getCompound("Position");
        const size = region.getCompound("Size");
        const p = [pos.getNumber("x"), pos.getNumber("y"), pos.getNumber("z")];
        const s = [size.getNumber("x"), size.getNumber("y"), size.getNumber("z")];
        for (let i = 0; i < 3; i++) {
          const lo = s[i] < 0 ? p[i] + s[i] + 1 : p[i];
          min[i] = Math.min(min[i], lo);
          max[i] = Math.max(max[i], lo + Math.abs(s[i]));
        }
      });
      return min[0] === Infinity ? [0, 0, 0] : [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    }
    case ".schem": {
      // Sponge v3 nests everything under "Schematic".
      const r = root.has("Schematic") ? root.getCompound("Schematic") : root;
      return [r.getNumber("Width"), r.getNumber("Height"), r.getNumber("Length")];
    }
    case ".schematic":
      return [root.getNumber("Width"), root.getNumber("Height"), root.getNumber("Length")];
    case ".nbt": {
      const list = root.getList("size");
      return [0, 1, 2].map((i) => Math.abs(list.getNumber(i)));
    }
    default:
      return abs(root);
  }
}

/** Parses any of the four supported schematic formats (detected by extension)
 *  into a deepslate Structure ready for StructureRenderer. NbtFile.read()
 *  auto-detects gzip/zlib/uncompressed, so no manual decompression is needed
 *  for any of them. Refuses (SchematicTooLargeError) files and boxes too big to
 *  handle before walking them. */
export function parseSchematic(bytes: Uint8Array, fileName: string): Structure {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (bytes.length > MAX_SCHEMATIC_BYTES) {
    throw new SchematicTooLargeError(
      `Este archivo de esquema es demasiado grande para previsualizarlo (${(bytes.length / 1024 / 1024).toFixed(0)} MB).`
    );
  }
  try {
    const root = NbtFile.read(bytes).root;
    const size = declaredSize(root, ext);
    if (size.some((n) => !Number.isFinite(n)) || size[0] * size[1] * size[2] > MAX_SCHEMATIC_VOLUME) tooLarge(size);
    switch (ext) {
      case ".litematic":
        return parseLitematic(root);
      case ".schem":
        return parseSpongeSchematic(root);
      case ".schematic":
        return parseLegacySchematic(root);
      case ".nbt":
        return Structure.fromNbt(root);
      default:
        throw new Error(`Formato de esquema no soportado: ${ext}`);
    }
  } catch (e) {
    if (e instanceof SchematicTooLargeError) throw e;
    console.error(`[schematic-parser] Error al leer ${fileName}:`, e);
    throw new Error("No se pudo leer el esquema.");
  }
}
