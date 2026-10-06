// Minimal uncompressed, big-endian NBT (Java Edition) reader/writer — just
// enough to round-trip servers.dat without losing anything Minecraft put in it.
// Every tag keeps its type, so reading a file and writing it back is lossless.
//
// Representation: { type, value } for every tag.
//   compound → value is an ordered array of [name, tag]
//   list     → value is { elemType, items: tag[] }
//   byte/short/int/float/double → number, long → BigInt, string → string,
//   byte/int/long arrays → arrays of numbers (BigInt for longs).

const T = {
  END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6,
  BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12,
};

// Java's "modified UTF-8" differs from plain UTF-8 only for U+0000 and
// characters outside the BMP — neither shows up in server names/addresses in
// practice, so plain UTF-8 is what Minecraft itself ends up reading here.
function readNbt(buf) {
  let o = 0;
  const str = () => {
    const len = buf.readUInt16BE(o); o += 2;
    const s = buf.toString("utf8", o, o + len); o += len;
    return s;
  };
  const payload = (type) => {
    switch (type) {
      case T.BYTE: { const v = buf.readInt8(o); o += 1; return v; }
      case T.SHORT: { const v = buf.readInt16BE(o); o += 2; return v; }
      case T.INT: { const v = buf.readInt32BE(o); o += 4; return v; }
      case T.LONG: { const v = buf.readBigInt64BE(o); o += 8; return v; }
      case T.FLOAT: { const v = buf.readFloatBE(o); o += 4; return v; }
      case T.DOUBLE: { const v = buf.readDoubleBE(o); o += 8; return v; }
      case T.BYTE_ARRAY: { const n = buf.readInt32BE(o); o += 4; const a = []; for (let i = 0; i < n; i++) { a.push(buf.readInt8(o)); o += 1; } return a; }
      case T.STRING: return str();
      case T.LIST: {
        const elemType = buf.readUInt8(o); o += 1;
        const n = buf.readInt32BE(o); o += 4;
        const items = [];
        for (let i = 0; i < n; i++) items.push({ type: elemType, value: payload(elemType) });
        return { elemType, items };
      }
      case T.COMPOUND: {
        const entries = [];
        for (;;) {
          const t = buf.readUInt8(o); o += 1;
          if (t === T.END) break;
          const name = str();
          entries.push([name, { type: t, value: payload(t) }]);
        }
        return entries;
      }
      case T.INT_ARRAY: { const n = buf.readInt32BE(o); o += 4; const a = []; for (let i = 0; i < n; i++) { a.push(buf.readInt32BE(o)); o += 4; } return a; }
      case T.LONG_ARRAY: { const n = buf.readInt32BE(o); o += 4; const a = []; for (let i = 0; i < n; i++) { a.push(buf.readBigInt64BE(o)); o += 8; } return a; }
      default: throw new Error(`Etiqueta NBT desconocida: ${type}`);
    }
  };
  const rootType = buf.readUInt8(o); o += 1;
  if (rootType !== T.COMPOUND) throw new Error("El archivo NBT no empieza por un compound.");
  const rootName = str();
  return { name: rootName, tag: { type: T.COMPOUND, value: payload(T.COMPOUND) } };
}

function writeNbt({ name, tag }) {
  const chunks = [];
  const u8 = (v) => { const b = Buffer.alloc(1); b.writeUInt8(v); chunks.push(b); };
  const str = (s) => {
    const bytes = Buffer.from(s, "utf8");
    const len = Buffer.alloc(2); len.writeUInt16BE(bytes.length);
    chunks.push(len, bytes);
  };
  const payload = (type, value) => {
    let b;
    switch (type) {
      case T.BYTE: b = Buffer.alloc(1); b.writeInt8(value); chunks.push(b); return;
      case T.SHORT: b = Buffer.alloc(2); b.writeInt16BE(value); chunks.push(b); return;
      case T.INT: b = Buffer.alloc(4); b.writeInt32BE(value); chunks.push(b); return;
      case T.LONG: b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(value)); chunks.push(b); return;
      case T.FLOAT: b = Buffer.alloc(4); b.writeFloatBE(value); chunks.push(b); return;
      case T.DOUBLE: b = Buffer.alloc(8); b.writeDoubleBE(value); chunks.push(b); return;
      case T.BYTE_ARRAY: b = Buffer.alloc(4); b.writeInt32BE(value.length); chunks.push(b); for (const v of value) payload(T.BYTE, v); return;
      case T.STRING: str(value); return;
      case T.LIST:
        u8(value.items.length ? value.elemType : T.END);
        b = Buffer.alloc(4); b.writeInt32BE(value.items.length); chunks.push(b);
        for (const item of value.items) payload(value.elemType, item.value);
        return;
      case T.COMPOUND:
        for (const [n, t] of value) { u8(t.type); str(n); payload(t.type, t.value); }
        u8(T.END);
        return;
      case T.INT_ARRAY: b = Buffer.alloc(4); b.writeInt32BE(value.length); chunks.push(b); for (const v of value) payload(T.INT, v); return;
      case T.LONG_ARRAY: b = Buffer.alloc(4); b.writeInt32BE(value.length); chunks.push(b); for (const v of value) payload(T.LONG, v); return;
      default: throw new Error(`Etiqueta NBT desconocida: ${type}`);
    }
  };
  u8(T.COMPOUND);
  str(name);
  payload(T.COMPOUND, tag.value);
  return Buffer.concat(chunks);
}

module.exports = { readNbt, writeNbt, NBT: T };
