import { NbtFile, Structure } from "deepslate";
import { parseLitematic } from "./schematic-litematic";
import { parseSpongeSchematic } from "./schematic-sponge";
import { parseLegacySchematic } from "./schematic-legacy";

/** Parses any of the four supported schematic formats (detected by extension)
 *  into a deepslate Structure ready for StructureRenderer. NbtFile.read()
 *  auto-detects gzip/zlib/uncompressed, so no manual decompression is needed
 *  for any of them. */
export function parseSchematic(bytes: Uint8Array, fileName: string): Structure {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  try {
    const root = NbtFile.read(bytes).root;
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
    console.error(`[schematic-parser] Error al leer ${fileName}:`, e);
    throw new Error("No se pudo leer el esquema.");
  }
}
