// ─── DIAGNÓSTICO DE CRASHEOS ─────────────────────────────────────────────────
// Two halves, both used from main.js:
//  · detectCrash(): when a game session ends, did it crash? (crash report,
//    JVM fatal error file, or the tell-tale lines in launch.log). main.js keeps
//    a per-instance streak in alaunchi-meta.json and, from the 3rd crash in a
//    row, the renderer offers a diagnosis.
//  · diagnoseInstance(): looks at everything that usually breaks an instance
//    while modding — damaged/missing files (the modpack's, Minecraft's, the
//    loader's), duplicate mods, mods for another loader or Minecraft version,
//    missing dependencies, declared incompatibilities, and what the crash
//    report/logs point at (memory, Java, Mixin, the mod in the stack trace,
//    broken config, graphics driver) — and returns findings, most certain
//    first, each with a fix the player can apply (applyFix, validated again
//    there). Nothing here changes a file except applyFix.
//
// Jars are read with a small zip reader of our own (central directory + only
// the entries we need), never loaded whole: an instance can have hundreds of
// MB of mods and this runs in the main process.

const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const zlib = require("zlib");

// ── Zip (just enough to list entries and read a few small ones) ─────────────

function parseCentralDirectory(buf, cdOffset, cdSize, count) {
  const entries = new Map();
  let p = cdOffset;
  const end = cdOffset + cdSize;
  for (let i = 0; i < count && p + 46 <= end; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("directorio central inválido");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.set(name, { method, compSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function findEocd(tail) {
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function inflateEntry(method, data) {
  if (method === 0) return data;
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error(`compresión ${method} no soportada`);
}

/** A zip on disk: entry names + read(name) for small entries. Throws on a damaged file. */
async function openZipFile(filePath) {
  const fh = await fs.open(filePath, "r");
  try {
    const { size } = await fh.stat();
    if (size < 22) throw new Error("archivo demasiado pequeño para ser un zip");
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    const e = findEocd(tail);
    if (e < 0) throw new Error("no se encuentra el final del zip (archivo cortado o dañado)");
    const count = tail.readUInt16LE(e + 10);
    const cdSize = tail.readUInt32LE(e + 12);
    const cdOffset = tail.readUInt32LE(e + 16);
    if (cdOffset === 0xffffffff || count === 0xffff) throw new Error("zip64");
    if (cdOffset + cdSize > size) throw new Error("el índice del zip apunta fuera del archivo (dañado)");
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const entries = parseCentralDirectory(cd, 0, cdSize, count);
    const read = async (name) => {
      const ent = entries.get(name);
      if (!ent) return null;
      const header = Buffer.alloc(30);
      await fh.read(header, 0, 30, ent.localOffset);
      if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`entrada dañada: ${name}`);
      const dataStart = ent.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
      const data = Buffer.alloc(ent.compSize);
      await fh.read(data, 0, ent.compSize, dataStart);
      return inflateEntry(ent.method, data);
    };
    return { entries, read, close: () => fh.close() };
  } catch (err) {
    await fh.close().catch(() => {});
    throw err;
  }
}

/** Same for a jar nested inside another (already in memory). */
function openZipBuffer(buf) {
  const e = findEocd(buf.subarray(Math.max(0, buf.length - 65557)));
  if (e < 0) throw new Error("zip anidado dañado");
  const base = Math.max(0, buf.length - 65557);
  const count = buf.readUInt16LE(base + e + 10);
  const cdSize = buf.readUInt32LE(base + e + 12);
  const cdOffset = buf.readUInt32LE(base + e + 16);
  const entries = parseCentralDirectory(buf, cdOffset, cdSize, count);
  const read = async (name) => {
    const ent = entries.get(name);
    if (!ent) return null;
    const p = ent.localOffset;
    const dataStart = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
    return inflateEntry(ent.method, buf.subarray(dataStart, dataStart + ent.compSize));
  };
  return { entries, read, close: async () => {} };
}

// ── Mod metadata ─────────────────────────────────────────────────────────────

function parseLooseJson(text) {
  try {
    return JSON.parse(text);
  } catch {}
  // Some fabric.mod.json have raw newlines/tabs inside strings or // comments.
  try {
    return JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/[\u0000-\u001f]+/g, " "));
  } catch {
    return null;
  }
}

/** Minimal TOML for mods.toml: [[mods]] and [[dependencies.<id>]] tables of key = value. */
function parseModsToml(text) {
  const mods = [];
  const deps = [];
  let current = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const table = /^\[\[\s*([^\]]+?)\s*\]\]/.exec(line);
    if (table) {
      const name = table[1];
      if (name === "mods") {
        current = {};
        mods.push(current);
      } else if (name.startsWith("dependencies.")) {
        current = { owner: name.slice("dependencies.".length).replace(/"/g, "") };
        deps.push(current);
      } else current = null;
      continue;
    }
    if (/^\[/.test(line)) {
      current = null;
      continue;
    }
    const kv = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    // Multi-line strings (descriptions): skip to their end.
    const triple = value.startsWith('"""') ? '"""' : value.startsWith("'''") ? "'''" : null;
    if (triple) {
      if (!(value.length > 3 && value.slice(3).includes(triple))) {
        while (i + 1 < lines.length && !lines[i + 1].includes(triple)) i++;
        i++;
      }
      continue;
    }
    const quoted = /^"((?:[^"\\]|\\.)*)"|^'([^']*)'/.exec(value);
    if (quoted) value = quoted[1] ?? quoted[2];
    else value = value.replace(/\s+#.*$/, "");
    if (current) current[kv[1]] = value;
  }
  return { mods, deps };
}

const LOADER_BUILTIN_IDS = new Set([
  "minecraft", "java", "forge", "neoforge", "fml", "javafml", "lowcodefml", "mcp",
  "fabricloader", "fabric-loader", "quilt_loader", "quiltloader",
]);

/**
 * Reads what a jar declares about itself. `kinds` says which loaders' metadata
 * it carries; `ids` are mod ids it provides (nested jars included, one level
 * deep twice — fabric-api nests its modules).
 */
async function readJarInfo(zip, depth = 0) {
  const info = {
    kinds: new Set(), // "fabric" | "quilt" | "forge" | "neoforge" | "legacy"
    mods: [], // { id, name, version, minecraft, depends: [{id, range}], breaks: [{id}] }
    providedIds: new Set(),
    packages: new Set(),
    mixinConfigs: new Set(),
  };
  for (const name of zip.entries.keys()) {
    if (name.endsWith(".class")) {
      const slash = name.lastIndexOf("/");
      if (slash > 0) info.packages.add(name.slice(0, slash));
    } else if (!name.includes("/") && /mixin.*\.json$|\.json$/i.test(name) && /mixin/i.test(name)) {
      info.mixinConfigs.add(name);
    }
  }

  const fabricRaw = (await zip.read("fabric.mod.json").catch(() => null)) || null;
  if (fabricRaw) {
    const j = parseLooseJson(fabricRaw.toString("utf8"));
    if (j && j.id) {
      info.kinds.add("fabric");
      const toList = (obj) => Object.entries(obj && typeof obj === "object" ? obj : {}).map(([id, range]) => ({ id, range }));
      const depends = toList(j.depends);
      info.mods.push({
        id: j.id,
        name: j.name || j.id,
        version: String(j.version ?? ""),
        minecraft: depends.find((d) => d.id === "minecraft")?.range ?? null,
        minecraftFormat: "fabric",
        depends: depends.filter((d) => !LOADER_BUILTIN_IDS.has(d.id)),
        breaks: toList(j.breaks).filter((d) => !LOADER_BUILTIN_IDS.has(d.id)),
        environment: j.environment || "*",
      });
      info.providedIds.add(j.id);
      for (const p of Array.isArray(j.provides) ? j.provides : []) if (typeof p === "string") info.providedIds.add(p);
      for (const m of Array.isArray(j.mixins) ? j.mixins : []) {
        const cfg = typeof m === "string" ? m : m?.config;
        if (cfg) info.mixinConfigs.add(cfg);
      }
    }
  }
  const quiltRaw = await zip.read("quilt.mod.json").catch(() => null);
  if (quiltRaw) {
    const j = parseLooseJson(quiltRaw.toString("utf8"));
    const ql = j?.quilt_loader;
    if (ql?.id) {
      info.kinds.add("quilt");
      info.providedIds.add(ql.id);
      if (!info.mods.some((m) => m.id === ql.id)) {
        info.mods.push({ id: ql.id, name: ql.metadata?.name || ql.id, version: String(ql.version ?? ""), minecraft: null, depends: [], breaks: [] });
      }
    }
  }
  for (const [file, kind] of [["META-INF/neoforge.mods.toml", "neoforge"], ["META-INF/mods.toml", "forge"]]) {
    const raw = await zip.read(file).catch(() => null);
    if (!raw) continue;
    const { mods, deps } = parseModsToml(raw.toString("utf8"));
    if (!mods.length) continue;
    info.kinds.add(kind);
    for (const m of mods) {
      if (!m.modId) continue;
      info.providedIds.add(m.modId);
      if (info.mods.some((x) => x.id === m.modId)) continue;
      const own = deps.filter((d) => d.owner === m.modId || mods.length === 1);
      const clientSide = (d) => !d.side || !/^SERVER$/i.test(d.side);
      const required = (d) => (d.type ? /^required$/i.test(d.type) : String(d.mandatory) === "true");
      info.mods.push({
        id: m.modId,
        name: m.displayName || m.modId,
        version: /\$\{/.test(m.version || "") ? "" : m.version || "",
        minecraft: own.find((d) => d.modId === "minecraft")?.versionRange ?? null,
        minecraftFormat: "maven",
        depends: own
          .filter((d) => d.modId && !LOADER_BUILTIN_IDS.has(d.modId) && required(d) && clientSide(d))
          .map((d) => ({ id: d.modId, range: d.versionRange })),
        breaks: own.filter((d) => d.modId && /^incompatible$/i.test(d.type || "")).map((d) => ({ id: d.modId })),
      });
    }
  }
  const legacyRaw = await zip.read("mcmod.info").catch(() => null);
  if (legacyRaw) {
    const j = parseLooseJson(legacyRaw.toString("utf8"));
    const list = Array.isArray(j) ? j : Array.isArray(j?.modList) ? j.modList : [];
    for (const m of list) {
      if (!m?.modid) continue;
      info.kinds.add("legacy");
      info.providedIds.add(m.modid);
      if (!info.mods.some((x) => x.id === m.modid)) {
        info.mods.push({ id: m.modid, name: m.name || m.modid, version: String(m.version ?? ""), minecraft: null, depends: [], breaks: [] });
      }
    }
  }
  const manifest = await zip.read("META-INF/MANIFEST.MF").catch(() => null);
  if (manifest) {
    const m = /MixinConfigs:\s*([^\r\n]+)/.exec(manifest.toString("utf8"));
    if (m) for (const cfg of m[1].split(",")) if (cfg.trim()) info.mixinConfigs.add(cfg.trim());
  }

  // Jar-in-jar: what they provide counts as present (and their code is this jar's).
  if (depth < 2) {
    for (const name of zip.entries.keys()) {
      if (!/^META-INF\/(jars|jarjar)\/.+\.jar$/i.test(name)) continue;
      try {
        const buf = await zip.read(name);
        if (!buf) continue;
        const nested = await readJarInfo(openZipBuffer(buf), depth + 1);
        for (const id of nested.providedIds) info.providedIds.add(id);
        for (const p of nested.packages) info.packages.add(p);
      } catch {}
    }
  }
  return info;
}

// ── Versions & ranges ────────────────────────────────────────────────────────

function parseNumericVersion(v) {
  const base = String(v).trim().split(/[-+ ]/)[0];
  if (!/^\d+(\.\d+)*$/.test(base)) return null;
  return base.split(".").map(Number);
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Fabric/semver-ish predicate ("1.20.x", ">=1.20 <1.21", "~1.20.1", ["1.20", "1.20.1"]). null = can't tell. */
function matchesFabricRange(range, mc) {
  const target = parseNumericVersion(mc);
  if (!target) return null;
  const alternatives = Array.isArray(range) ? range : [range];
  let anyParsed = false;
  for (const alt of alternatives) {
    if (typeof alt !== "string") continue;
    const clauses = alt.trim().split(/\s+/).filter(Boolean);
    let ok = true;
    let parsed = true;
    for (const c of clauses) {
      if (c === "*" || c === "x") continue;
      const m = /^(>=|<=|>|<|=|~|\^)?(.+)$/.exec(c);
      const op = m[1] || "";
      const raw = m[2];
      if (/[xX*]/.test(raw)) {
        const parts = raw.split(".");
        const fixed = [];
        for (const p of parts) {
          if (/^[xX*]$/.test(p)) break;
          if (!/^\d+$/.test(p)) { parsed = false; break; }
          fixed.push(Number(p));
        }
        if (!parsed) break;
        if (!fixed.every((n, i) => target[i] === n)) ok = false;
        continue;
      }
      const v = parseNumericVersion(raw);
      if (!v) { parsed = false; break; }
      const cmp = compareVersions(target, v);
      if (op === ">=" && !(cmp >= 0)) ok = false;
      else if (op === "<=" && !(cmp <= 0)) ok = false;
      else if (op === ">" && !(cmp > 0)) ok = false;
      else if (op === "<" && !(cmp < 0)) ok = false;
      else if ((op === "=" || op === "") && cmp !== 0) ok = false;
      else if (op === "~") {
        const upper = v.length > 1 ? [v[0], (v[1] || 0) + 1] : [v[0] + 1];
        if (!(cmp >= 0 && compareVersions(target, upper) < 0)) ok = false;
      } else if (op === "^") {
        if (!(cmp >= 0 && target[0] === v[0])) ok = false;
      }
    }
    if (!parsed) continue;
    anyParsed = true;
    if (ok) return true;
  }
  return anyParsed ? false : null;
}

/** Maven range ("[1.20.1,1.21)", "[1.20]", "1.20.1" = soft, any). null = can't tell. */
function matchesMavenRange(range, mc) {
  const target = parseNumericVersion(mc);
  if (!target || typeof range !== "string") return null;
  const r = range.trim();
  if (!r || r === "*") return true;
  if (!/[[(]/.test(r)) return true; // soft requirement
  const re = /([[(])\s*([^,\])]*)\s*(?:,\s*([^\])]*))?\s*([\])])/g;
  let m;
  let anyParsed = false;
  while ((m = re.exec(r))) {
    const [, open, lo, hi, close] = m;
    const single = hi === undefined;
    const lov = lo ? parseNumericVersion(lo) : null;
    const hiv = single ? lov : hi ? parseNumericVersion(hi) : null;
    if ((lo && !lov) || (!single && hi && !hiv)) continue;
    anyParsed = true;
    let ok = true;
    if (lov) {
      const c = compareVersions(target, lov);
      if (open === "[" ? c < 0 : c <= 0) ok = false;
    }
    if (hiv) {
      const c = compareVersions(target, hiv);
      if (close === "]" ? c > 0 : c >= 0) ok = false;
    }
    if (ok) return true;
  }
  return anyParsed ? false : null;
}

// ── Crash detection (end of a session) ───────────────────────────────────────

const LOG_CRASH_MARKERS = [
  { re: /---- Minecraft Crash Report ----/, reason: "Minecraft generó un informe de error" },
  { re: /#@!@# Game crashed!/, reason: "Minecraft generó un informe de error" },
  { re: /Mod resolution encountered an incompatible mod set|Incompatible mods? found/i, reason: "Fabric no pudo cargar los mods (incompatibles o falta alguno)" },
  { re: /Missing or unsupported mandatory dependencies/i, reason: "Faltan dependencias obligatorias de algún mod" },
  { re: /Error: Could not find or load main class/i, reason: "No se encontró la clase principal (loader dañado)" },
  { re: /Error occurred during initialization of VM|Could not reserve enough space for (?:the )?object heap/i, reason: "Java no pudo arrancar" },
  { re: /Uncaught exception in thread "main"|Exception in thread "main"/, reason: "Error al arrancar el juego" },
  { re: /java\.lang\.OutOfMemoryError/, reason: "Se quedó sin memoria" },
];

async function readTail(filePath, maxBytes) {
  try {
    const fh = await fs.open(filePath, "r");
    try {
      const { size } = await fh.stat();
      const len = Math.min(size, maxBytes);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, size - len);
      return buf.toString("utf8");
    } finally {
      await fh.close();
    }
  } catch {
    return "";
  }
}

async function readHead(filePath, maxBytes) {
  try {
    const fh = await fs.open(filePath, "r");
    try {
      const buf = Buffer.alloc(maxBytes);
      const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
      return buf.toString("utf8", 0, bytesRead);
    } finally {
      await fh.close();
    }
  } catch {
    return "";
  }
}

async function newestFile(dir, re, sinceMs) {
  let best = null;
  try {
    for (const name of await fs.readdir(dir)) {
      if (!re.test(name)) continue;
      const full = path.join(dir, name);
      const st = await fs.stat(full).catch(() => null);
      if (!st?.isFile() || st.mtimeMs < sinceMs) continue;
      if (!best || st.mtimeMs > best.mtimeMs) best = { path: full, mtimeMs: st.mtimeMs };
    }
  } catch {}
  return best;
}

/** Files in `dir` matching `re`, newest first. */
async function listFiles(dir, re) {
  const out = [];
  try {
    for (const name of await fs.readdir(dir)) {
      if (!re.test(name)) continue;
      const full = path.join(dir, name);
      const st = await fs.stat(full).catch(() => null);
      if (st?.isFile()) out.push({ path: full, mtimeMs: st.mtimeMs });
    }
  } catch {}
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** Did the session that started at `startedAt` end in a crash? */
async function detectCrash({ instanceDir, startedAt }) {
  const since = (startedAt || 0) - 2000;
  const report = await newestFile(path.join(instanceDir, "crash-reports"), /^crash-.*\.txt$/i, since);
  if (report) {
    const text = await readTail(report.path, 64 * 1024);
    const description = /^Description:\s*(.+)$/m.exec(text)?.[1]?.trim() || null;
    // F3 + C held down: the player closed it on purpose. Not a crash, not a clean exit either.
    if (/Manually triggered debug crash/i.test(description || "")) return { crashed: false, manual: true };
    return { crashed: true, reason: "Minecraft generó un informe de error", description, file: report.path };
  }
  const jvm = await newestFile(instanceDir, /^hs_err_pid\d+\.log$/i, since);
  if (jvm) return { crashed: true, reason: "Java se cerró por un error grave", description: null, file: jvm.path };
  const log = await readTail(path.join(instanceDir, "launch.log"), 512 * 1024);
  for (const { re, reason } of LOG_CRASH_MARKERS) {
    if (re.test(log)) return { crashed: true, reason, description: null, file: null };
  }
  return { crashed: false };
}

// ── Diagnosis ────────────────────────────────────────────────────────────────

const SEVERITY_ORDER = { critical: 0, likely: 1, possible: 2, info: 3 };

// Code that's in every stack trace and never "the mod to blame".
const IGNORED_FRAME_PREFIXES = [
  "java.", "javax.", "jdk.", "sun.", "com.sun.", "net.minecraft.", "com.mojang.", "cpw.mods.",
  "net.minecraftforge.", "net.neoforged.", "net.fabricmc.", "org.quiltmc.", "org.spongepowered.",
  "org.lwjgl.", "io.netty.", "com.google.", "org.apache.", "it.unimi.", "oshi.", "org.slf4j.",
  "org.objectweb.", "com.llamalad7.mixinextras.", "org.joml.", "com.electronwill.", "org.openjdk.",
  "kotlin.", "kotlinx.", "scala.", "MC-BOOTSTRAP", "knot//", "TRANSFORMER/", "SECURE-BOOTSTRAP/",
];

// Libraries other mods lean on, by the packages their classes live in. When a
// class from one of these is missing, the error names the class, not the mod:
// this turns "NoClassDefFoundError: dev/architectury/..." into "falta Architectury"
// and gives the Modrinth slug to install it. `forgeSlug` = the port Forge/NeoForge use.
const KNOWN_LIBS = [
  { prefixes: ["dev/architectury/"], id: "architectury", name: "Architectury API", slug: "architectury-api" },
  { prefixes: ["me/shedaniel/clothconfig2/", "me/shedaniel/autoconfig/", "me/shedaniel/cloth/"], id: "cloth-config", name: "Cloth Config API", slug: "cloth-config" },
  { prefixes: ["software/bernie/geckolib"], id: "geckolib", name: "GeckoLib", slug: "geckolib" },
  { prefixes: ["net/fabricmc/fabric/"], id: "fabric-api", name: "Fabric API", slug: "fabric-api", forgeSlug: "forgified-fabric-api" },
  { prefixes: ["net/fabricmc/language/kotlin/"], id: "fabric-language-kotlin", name: "Fabric Language Kotlin", slug: "fabric-language-kotlin" },
  { prefixes: ["kotlin/", "kotlinx/"], id: "kotlin", name: "Kotlin", slug: "fabric-language-kotlin", forgeSlug: "kotlin-for-forge", modId: { fabric: "fabric-language-kotlin", quilt: "fabric-language-kotlin", forge: "kotlinforforge", neoforge: "kotlinforforge" } },
  { prefixes: ["thedarkcolour/kotlinforforge/"], id: "kotlinforforge", name: "Kotlin for Forge", slug: "kotlin-for-forge" },
  { prefixes: ["top/theillusivec4/curios/"], id: "curios", name: "Curios API", slug: "curios" },
  { prefixes: ["dev/emi/trinkets/"], id: "trinkets", name: "Trinkets", slug: "trinkets" },
  { prefixes: ["net/blay09/mods/balm/"], id: "balm", name: "Balm", slug: "balm" },
  { prefixes: ["fuzs/puzzleslib/"], id: "puzzleslib", name: "Puzzles Lib", slug: "puzzles-lib" },
  { prefixes: ["fuzs/forgeconfigapiport/", "net/minecraftforge/fml/config/"], id: "forgeconfigapiport", name: "Forge Config API Port", slug: "forge-config-api-port", onlyFabric: true },
  { prefixes: ["vazkii/patchouli/"], id: "patchouli", name: "Patchouli", slug: "patchouli" },
  { prefixes: ["io/wispforest/owo/"], id: "owo", name: "oωo", slug: "owo-lib" },
  { prefixes: ["dev/isxander/yacl3/", "dev/isxander/yacl/"], id: "yet_another_config_lib_v3", name: "YetAnotherConfigLib", slug: "yacl" },
  { prefixes: ["com/teamresourceful/resourcefullib/"], id: "resourcefullib", name: "Resourceful Lib", slug: "resourceful-lib" },
  { prefixes: ["com/teamresourceful/resourcefulconfig/"], id: "resourcefulconfig", name: "Resourceful Config", slug: "resourceful-config" },
  { prefixes: ["com/github/alexthe666/citadel/"], id: "citadel", name: "Citadel", slug: "citadel" },
  { prefixes: ["terrablender/"], id: "terrablender", name: "TerraBlender", slug: "terrablender" },
  { prefixes: ["mezz/jei/"], id: "jei", name: "Just Enough Items", slug: "jei" },
  { prefixes: ["com/terraformersmc/modmenu/"], id: "modmenu", name: "Mod Menu", slug: "modmenu" },
  { prefixes: ["dev/kosmx/playeranim/", "dev/kosmx/playerAnim/"], id: "playeranimator", name: "playerAnimator", slug: "playeranimator" },
  { prefixes: ["com/mrcrayfish/framework/"], id: "framework", name: "Framework", slug: null },
  { prefixes: ["net/mehvahdjukaar/moonlight/"], id: "moonlight", name: "Moonlight Lib", slug: "moonlight" },
  { prefixes: ["dev/onyxstudios/cca/", "org/ladysnake/cca/"], id: "cardinal-components", name: "Cardinal Components API", slug: "cardinal-components-api" },
  { prefixes: ["com/llamalad7/mixinextras/"], id: "mixinextras", name: "MixinExtras", slug: null },
  { prefixes: ["net/darkhax/bookshelf/"], id: "bookshelf", name: "Bookshelf", slug: "bookshelf-lib" },
  { prefixes: ["com/blamejared/crafttweaker/"], id: "crafttweaker", name: "CraftTweaker", slug: "crafttweaker" },
  { prefixes: ["snownee/kiwi/"], id: "kiwi", name: "Kiwi", slug: "kiwi" },
  { prefixes: ["me/fzzyhmstrs/fzzy_config/"], id: "fzzy_config", name: "Fzzy Config", slug: "fzzy-config" },
  { prefixes: ["eu/midnightdust/lib/"], id: "midnightlib", name: "MidnightLib", slug: "midnightlib" },
  { prefixes: ["com/natamus/collective/"], id: "collective", name: "Collective", slug: "collective" },
  { prefixes: ["dev/latvian/mods/kubejs/"], id: "kubejs", name: "KubeJS", slug: "kubejs" },
  { prefixes: ["dev/latvian/mods/rhino/"], id: "rhino", name: "Rhino", slug: "rhino" },
  { prefixes: ["mod/azure/azurelib/"], id: "azurelib", name: "AzureLib", slug: "azurelib" },
  { prefixes: ["team/lodestar/lodestone/"], id: "lodestone", name: "Lodestone", slug: "lodestone" },
  { prefixes: ["me/lucko/fabric/api/permissions/"], id: "fabric-permissions-api-v0", name: "fabric-permissions-api", slug: "fabric-permissions-api" },
  { prefixes: ["com/simibubi/create/"], id: "create", name: "Create", slug: "create" },
  { prefixes: ["net/caffeinemc/mods/sodium/", "me/jellysquid/mods/sodium/"], id: "sodium", name: "Sodium", slug: "sodium" },
  { prefixes: ["net/irisshaders/iris/", "net/coderbot/iris/"], id: "iris", name: "Iris", slug: "iris" },
  { prefixes: ["org/embeddedt/embeddium/"], id: "embeddium", name: "Embeddium", slug: "embeddium" },
];

/** Known Modrinth slug for a mod id that isn't its own slug (deps declared in mods.toml / fabric.mod.json). */
const SLUG_FOR_ID = {
  architectury: "architectury-api",
  "cloth-config": "cloth-config",
  "cloth-config2": "cloth-config",
  "fabric-api": "fabric-api",
  fabric: "fabric-api",
  puzzleslib: "puzzles-lib",
  forgeconfigapiport: "forge-config-api-port",
  owo: "owo-lib",
  yet_another_config_lib_v3: "yacl",
  yet_another_config_lib: "yacl",
  resourcefullib: "resourceful-lib",
  resourcefulconfig: "resourceful-config",
  bookshelf: "bookshelf-lib",
  kotlinforforge: "kotlin-for-forge",
  "cardinal-components": "cardinal-components-api",
  "cardinal-components-base": "cardinal-components-api",
  supermartijn642corelib: "supermartijn642s-core-lib",
  supermartijn642configlib: "supermartijn642s-config-lib",
  fusion: "fusion-connected-textures",
  sophisticatedcore: "sophisticated-core",
  "fabric-language-kotlin": "fabric-language-kotlin",
  "fabric-permissions-api-v0": "fabric-permissions-api",
  prism: "prism-lib",
  zeta: "zeta",
  creativecore: "creativecore",
  placebo: "placebo",
  geckolib3: "geckolib",
};

/** Mods that are known not to work together. `drop` = the one we suggest turning off. */
const KNOWN_CONFLICTS = [
  { a: ["optifine", "optifabric"], b: ["sodium", "embeddium", "rubidium", "magnesium"], drop: "a", why: "OptiFine reescribe el mismo motor de render que {b}: juntos el juego se cierra al arrancar o al entrar al mundo. Quita OptiFine (con {b} + Iris/Oculus tienes shaders igual)." },
  { a: ["optifine", "optifabric"], b: ["iris", "oculus"], drop: "a", why: "OptiFine y {b} cargan shaders cada uno a su manera y chocan. Usa solo {b}." },
  { a: ["rubidium"], b: ["embeddium"], drop: "a", why: "Rubidium y Embeddium son el mismo mod (Embeddium es su continuación). Deja solo Embeddium." },
  { a: ["magnesium"], b: ["embeddium", "rubidium"], drop: "a", why: "Magnesium es una versión antigua de {b}. Deja solo {b}." },
  { a: ["phosphor"], b: ["starlight"], drop: "a", why: "Phosphor y Starlight reescriben el mismo motor de luz. Deja solo Starlight." },
  { a: ["starlight"], b: ["moonrise"], drop: "a", why: "Moonrise ya incluye Starlight. Quita Starlight." },
  { a: ["betterfps"], b: ["optifine", "sodium", "embeddium"], drop: "a", why: "BetterFPS es antiguo y choca con {b}." },
  { a: ["oculus"], b: ["iris"], drop: "a", why: "Oculus es Iris para Forge: no hacen falta los dos. Deja el que corresponda a tu loader." },
];

/** Takes every secret out of text meant to be copied/shared (hs_err files hold the whole command line). */
function redact(text) {
  return String(text || "")
    .replace(/(--accessToken\s+)\S+/g, "$1[oculto]")
    .replace(/(--xuid\s+)\S+/g, "$1[oculto]")
    .replace(/(--clientId\s+)\S+/g, "$1[oculto]")
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, "[token oculto]")
    .replace(/([\\/](?:Users|home)[\\/])[^\\/\s]+/gi, "$1…");
}

/**
 * @param ctx {
 *   instanceDir, meta, mcVersion, loaderType, cacheDir, librariesDir, assetsDir,
 *   javaMajor, javaPath (null = none installed), currentRamMb, totalRamMb,
 *   hashFile (sha256), hashFileSha1, isUsableLaunchFile, isPlayerEditableFile, disabledSuffix,
 *   execFile (promisified, to check the Java), canRepairFromSource (bool)
 * }
 */
async function diagnoseInstance(ctx, onProgress = () => {}) {
  const findings = [];
  const add = (f) => {
    if (!findings.some((x) => x.key === f.key)) findings.push(f);
  };
  const { instanceDir, meta } = ctx;
  const loader = String(ctx.loaderType || meta?.loaderType || "vanilla").toLowerCase();
  const mc = ctx.mcVersion || meta?.minecraftVersion || "";
  const snapshotFiles = Array.isArray(meta?.snapshot?.files) ? meta.snapshot.files : null;
  const snapshotPaths = new Set((snapshotFiles || []).map((f) => f.path));
  const modsDir = path.join(instanceDir, "mods");

  // 1) What the crash says ─────────────────────────────────────────────────
  onProgress("Leyendo el informe del error", 0.02);
  // Recent crash reports, newest first, each with its "Description:" (near the top).
  // F3 + C reports ("Manually triggered debug crash") are skipped: they say nothing.
  const recentReports = [];
  let manualCrash = false;
  for (const r of (await listFiles(path.join(instanceDir, "crash-reports"), /^crash-.*\.txt$/i)).slice(0, 8)) {
    const head = await readHead(r.path, 8192);
    const description = /^Description:\s*(.+)$/m.exec(head)?.[1]?.trim() || "";
    if (/Manually triggered debug crash/i.test(description)) {
      if (!recentReports.length) manualCrash = true;
      continue;
    }
    recentReports.push({ ...r, description });
  }
  const report = recentReports[0] || null;
  const jvm = await newestFile(instanceDir, /^hs_err_pid\d+\.log$/i, 0);
  // Forge/NeoForge write their messages with § colour codes; they'd break every pattern below.
  const noColors = (t) => t.replace(/§[0-9a-fk-or]/gi, "");
  const reportText = report ? noColors(await readTail(report.path, 256 * 1024)) : "";
  // hs_err files put what matters (reason, problematic frame, command line) at the top.
  const jvmText = jvm ? await readHead(jvm.path, 128 * 1024) : "";
  const launchLog = noColors(await readTail(path.join(instanceDir, "launch.log"), 1024 * 1024));
  const latestLog = noColors(await readTail(path.join(instanceDir, "logs", "latest.log"), 1024 * 1024));
  const logs = `${launchLog}\n${latestLog}`;
  const allText = `${reportText}\n${jvmText}\n${logs}`;
  // The error itself: the crash report, or the logs from the first fatal line on. Mods log
  // harmless ClassNotFoundExceptions while probing optional integrations — those don't count.
  const fatalIdx = logs.search(/Exception in thread "main"|\/FATAL\]|Mod loading has failed|Failed to create mod instance|Could not execute entrypoint|Unreported exception thrown|#@!@# Game crashed|Exception in server tick loop|Encountered an unexpected exception/);
  const errorText = `${reportText}\n${jvmText}\n${!reportText && fatalIdx >= 0 ? logs.slice(fatalIdx) : ""}`;
  const lastCrashAt = Math.max(report?.mtimeMs || 0, jvm?.mtimeMs || 0) || null;

  // 2) Mods: metadata, classes, mixin configs ───────────────────────────────
  const jars = [];
  try {
    for (const name of await fs.readdir(modsDir)) if (/\.jar$/i.test(name)) jars.push(name);
  } catch {}
  const mods = []; // { file, rel, info, mtimeMs, damaged }
  for (let i = 0; i < jars.length; i++) {
    onProgress(`Analizando mods (${i + 1}/${jars.length})`, 0.05 + 0.35 * (i / Math.max(1, jars.length)));
    const file = path.join(modsDir, jars[i]);
    const rel = `mods/${jars[i]}`;
    const st = await fs.stat(file).catch(() => null);
    // A copied file keeps its old mtime on Windows; its creation time is when it got here.
    const changedAt = Math.max(st?.mtimeMs || 0, st?.birthtimeMs || 0);
    let zip = null;
    try {
      zip = await openZipFile(file);
      mods.push({ file, rel, info: await readJarInfo(zip), mtimeMs: st?.mtimeMs || 0, changedAt });
    } catch (e) {
      mods.push({ file, rel, info: null, mtimeMs: st?.mtimeMs || 0, changedAt, damaged: e.message });
    } finally {
      await zip?.close().catch(() => {});
    }
    await new Promise((r) => setImmediate(r));
  }
  const byId = new Map(); // mod id → [mod entries]
  const provided = new Set(LOADER_BUILTIN_IDS);
  for (const m of mods) {
    if (!m.info) continue;
    for (const id of m.info.providedIds) provided.add(id);
    for (const mi of m.info.mods) {
      if (!byId.has(mi.id)) byId.set(mi.id, []);
      byId.get(mi.id).push(m);
    }
  }
  const nameOf = (m) => m.info?.mods[0]?.name || path.basename(m.rel);
  const modForId = (id) => byId.get(id)?.[0] || null;
  const disableFix = (list, label) => ({
    kind: "disable-mods",
    label: label || (list.length === 1 ? `Desactivar ${nameOf(list[0])}` : `Desactivar ${list.length} mods`),
    paths: list.map((m) => m.rel),
  });
  // Download a missing mod from Modrinth (resolved by the renderer for this MC + loader;
  // main checks the jar really is `modId` before putting it in mods/).
  const canInstall = !!ctx.canInstallContent && !!mc && loader !== "vanilla";
  const installFix = (modId, name, slug) =>
    canInstall && modId && !LOADER_BUILTIN_IDS.has(modId)
      ? { kind: "install-mod", label: `Instalar ${name || modId}`, modId, name: name || modId, slug: slug || SLUG_FOR_ID[modId] || modId, mcVersion: mc, loader }
      : null;
  /** Primary fix + the other one as altFix (install the missing piece, or turn off who asks for it). */
  const withInstall = (install, disable) => (install ? { fix: install, altFix: disable } : { fix: disable });

  // Damaged jars.
  for (const m of mods.filter((x) => x.damaged)) {
    const fromPack = snapshotPaths.has(m.rel);
    add({
      key: `damaged:${m.rel}`,
      severity: "critical",
      category: "files",
      title: `El mod ${path.basename(m.rel)} está dañado`,
      detail: `No se puede leer como un .jar (${m.damaged}). Suele pasar cuando una descarga o una copia se corta a medias.`,
      fix: fromPack && ctx.canRepairFromSource
        ? { kind: "repair-files", label: "Volver a descargar" }
        : disableFix([m], "Desactivarlo"),
    });
  }

  // Duplicates (same mod id in two jars).
  for (const [id, list] of byId) {
    const uniq = [...new Set(list)];
    if (uniq.length < 2) continue;
    // Keep the one from the modpack, else the most recent file.
    const keep = uniq.find((m) => snapshotPaths.has(m.rel)) || [...uniq].sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    const extra = uniq.filter((m) => m !== keep);
    add({
      key: `dup:${id}`,
      severity: "critical",
      category: "mods",
      title: `${nameOf(keep)} está instalado ${uniq.length} veces`,
      detail: `Hay varias versiones del mismo mod (${uniq.map((m) => path.basename(m.rel)).join(", ")}). El juego no arranca con duplicados. Se conserva ${path.basename(keep.rel)}.`,
      fix: disableFix(extra, extra.length === 1 ? `Desactivar ${path.basename(extra[0].rel)}` : `Desactivar ${extra.length} copias`),
    });
  }

  // Wrong loader.
  const isForgeLike = loader === "forge" || loader === "neoforge";
  const isFabricLike = loader === "fabric" || loader === "quilt";
  const hasConnector = provided.has("connectormod");
  const mcv = parseNumericVersion(mc);
  const neoOnlyNeoToml = loader === "neoforge" && mcv && compareVersions(mcv, [1, 20, 5]) >= 0;
  for (const m of mods) {
    if (!m.info || !m.info.kinds.size) continue;
    const k = m.info.kinds;
    let wrong = null;
    if (isForgeLike && !k.has("forge") && !k.has("neoforge") && !k.has("legacy") && (k.has("fabric") || k.has("quilt")) && !hasConnector) wrong = "Fabric";
    else if (isFabricLike && !k.has("fabric") && !k.has("quilt") && (k.has("forge") || k.has("neoforge") || k.has("legacy"))) wrong = k.has("neoforge") ? "NeoForge" : "Forge";
    else if (loader === "forge" && k.has("neoforge") && !k.has("forge")) wrong = "NeoForge";
    else if (neoOnlyNeoToml && k.has("forge") && !k.has("neoforge")) wrong = "Forge";
    if (!wrong) continue;
    add({
      key: `loader:${m.rel}`,
      severity: "critical",
      category: "mods",
      title: `${nameOf(m)} es un mod de ${wrong}`,
      detail: `Esta instancia usa ${loader === "neoforge" ? "NeoForge" : loader === "forge" ? "Forge" : loader === "quilt" ? "Quilt" : "Fabric"}, y este mod está hecho para ${wrong}. Busca la versión correcta del mod o quítalo.`,
      fix: disableFix([m], "Desactivarlo"),
    });
  }

  // Minecraft version.
  for (const m of mods) {
    for (const mi of m.info?.mods || []) {
      if (!mi.minecraft || !mc) continue;
      const ok = mi.minecraftFormat === "maven" ? matchesMavenRange(mi.minecraft, mc) : matchesFabricRange(mi.minecraft, mc);
      if (ok !== false) continue;
      add({
        key: `mcver:${m.rel}`,
        severity: "likely",
        category: "mods",
        title: `${mi.name} no es para Minecraft ${mc}`,
        detail: `El mod pide Minecraft ${Array.isArray(mi.minecraft) ? mi.minecraft.join(" o ") : mi.minecraft}. Descarga la versión del mod para ${mc}.`,
        fix: disableFix([m], "Desactivarlo"),
      });
    }
  }

  // Missing dependencies / declared incompatibilities.
  for (const m of mods) {
    for (const mi of m.info?.mods || []) {
      for (const dep of mi.depends) {
        if (provided.has(dep.id)) continue;
        // fabric-api's old id.
        if (dep.id === "fabric" && provided.has("fabric-api")) continue;
        add({
          key: `missing:${mi.id}:${dep.id}`,
          severity: "critical",
          category: "mods",
          title: `${mi.name} necesita ${dep.id}, que no está instalado`,
          detail: `Instala "${dep.id}"${dep.range && dep.range !== "*" ? ` (versión ${Array.isArray(dep.range) ? dep.range.join(" o ") : dep.range})` : ""} o desactiva ${mi.name}.`,
          ...withInstall(installFix(dep.id), disableFix([m], `Desactivar ${mi.name}`)),
          searchQuery: dep.id,
        });
      }
      for (const br of mi.breaks) {
        const other = modForId(br.id);
        if (!other || other === m) continue;
        add({
          key: `breaks:${[mi.id, br.id].sort().join(":")}`,
          severity: "likely",
          category: "mods",
          title: `${mi.name} es incompatible con ${nameOf(other)}`,
          detail: `${mi.name} declara que no funciona junto a ${nameOf(other)}. Desactiva uno de los dos.`,
          fix: disableFix([other], `Desactivar ${nameOf(other)}`),
        });
      }
    }
  }

  // Mods that aren't from the modpack (online instances).
  if (snapshotFiles) {
    const extra = mods.filter((m) => !snapshotPaths.has(m.rel));
    if (extra.length) {
      add({
        key: "extra-mods",
        severity: "possible",
        category: "mods",
        title: extra.length === 1 ? "Hay 1 mod que no es del modpack" : `Hay ${extra.length} mods que no son del modpack`,
        detail: `${extra.map((m) => path.basename(m.rel)).slice(0, 12).join(", ")}${extra.length > 12 ? "…" : ""}. Si el juego empezó a fallar después de añadirlos, prueba a desactivarlos.`,
        fix: disableFix(extra, extra.length === 1 ? "Desactivarlo" : "Desactivarlos"),
      });
    }
  }

  // 3) Crash report / logs ─────────────────────────────────────────────────
  onProgress("Interpretando el error", 0.42);
  const classIndex = new Map(); // package (a/b/c) → mod
  for (const m of mods) for (const p of m.info?.packages || []) if (!classIndex.has(p)) classIndex.set(p, m);
  const mixinIndex = new Map(); // mixin config file → mod
  for (const m of mods) for (const c of m.info?.mixinConfigs || []) mixinIndex.set(c, m);
  const modForClass = (cls) => {
    let p = cls.replace(/\$.*$/, "").replace(/\./g, "/");
    p = p.slice(0, p.lastIndexOf("/"));
    while (p) {
      const hit = classIndex.get(p);
      if (hit) return hit;
      const i = p.lastIndexOf("/");
      if (i < 0) break;
      p = p.slice(0, i);
    }
    return null;
  };

  // Memory.
  if (/java\.lang\.OutOfMemoryError: (?:Java heap space|GC overhead limit exceeded)/.test(allText)) {
    const suggested = Math.min(Math.floor((ctx.totalRamMb * 0.6) / 512) * 512, (ctx.currentRamMb || 2048) + 2048);
    add({
      key: "oom-heap",
      severity: "critical",
      category: "memory",
      title: "Minecraft se quedó sin memoria",
      detail: `Tiene ${ctx.currentRamMb} MB asignados y no le llegan. Con muchos mods suele necesitar entre 4 y 8 GB.`,
      fix: suggested > ctx.currentRamMb ? { kind: "set-ram", label: `Subir a ${suggested} MB`, mb: suggested } : null,
    });
  }
  if (/insufficient memory for the Java Runtime Environment|Native memory allocation \(mmap\) failed|Could not reserve enough space for (?:the )?object heap/i.test(allText)) {
    const tooHigh = ctx.currentRamMb > ctx.totalRamMb * 0.7;
    const suggested = Math.max(2048, Math.floor((ctx.totalRamMb * 0.5) / 512) * 512);
    add({
      key: "oom-native",
      severity: "critical",
      category: "memory",
      title: "El equipo se quedó sin memoria para Java",
      detail: tooHigh
        ? `Minecraft tiene ${ctx.currentRamMb} MB asignados de ${ctx.totalRamMb} MB que tiene el equipo: no deja memoria para el resto. Bájala un poco.`
        : "Java pidió memoria y el sistema no se la pudo dar. Cierra otros programas pesados (navegador, otros juegos) antes de jugar.",
      fix: tooHigh && suggested < ctx.currentRamMb ? { kind: "set-ram", label: `Bajar a ${suggested} MB`, mb: suggested } : null,
    });
  }

  // Java version of a mod.
  const ucv = /UnsupportedClassVersionError:\s*([\w/$.]+).*?class file version (\d+)\.\d+.*?up to (\d+)\.\d+/.exec(allText);
  if (ucv) {
    const needed = Number(ucv[2]) - 44;
    const culprit = modForClass(ucv[1].replace(/\//g, "."));
    add({
      key: "java-version",
      severity: "critical",
      category: "java",
      title: culprit ? `${nameOf(culprit)} necesita Java ${needed}` : `Algo necesita Java ${needed}`,
      detail: `Minecraft ${mc} usa Java ${Number(ucv[3]) - 44}, pero ${culprit ? "este mod" : "una parte"} está compilado para Java ${needed}: casi siempre es un mod para una versión más nueva de Minecraft.`,
      fix: culprit ? disableFix([culprit], "Desactivarlo") : null,
    });
  }

  // Fabric's own resolution errors.
  for (const line of logs.split(/\r?\n/)) {
    const fm = /^\s*-\s*Mod '([^']+)' \(([^)]+)\) (\S+) (requires|is incompatible with|recommends) (.+?) of (?:mod )?'([^']+)' \(([^)]+)\),?\s*(.*)$/.exec(line);
    if (!fm) continue;
    const [, name, id, , verb, what, depName, depId, rest] = fm;
    if (verb === "recommends") continue;
    const self = modForId(id);
    const missing = /which is missing/i.test(rest);
    const selfFix = self ? disableFix([self], `Desactivar ${name}`) : null;
    // The loader, Minecraft or Java themselves: there's nothing to install, the mod is for another setup.
    if (verb === "requires" && (depId === "fabricloader" || depId === "quilt_loader")) {
      add({
        key: `loaderver:${id}`,
        severity: "critical",
        category: "loader",
        title: `${name} necesita una versión más nueva de ${loader === "quilt" ? "Quilt" : "Fabric"} Loader`,
        detail: `Pide ${what}. ${rest.replace(/!$/, "")}. Actualiza el loader de la instancia o usa una versión anterior de ${name}.`.replace(/\.\s*\./g, "."),
        fix: selfFix,
      });
      continue;
    }
    if (verb === "requires" && depId === "minecraft") {
      add({
        key: self ? `mcver:${self.rel}` : `mcver:${id}`,
        severity: "critical",
        category: "mods",
        title: `${name} no es para Minecraft ${mc}`,
        detail: `Pide ${what} de Minecraft. Descarga la versión del mod para ${mc} o desactívalo.`,
        fix: selfFix,
      });
      continue;
    }
    if (verb === "requires" && depId === "java") {
      add({
        key: `javamod:${id}`,
        severity: "critical",
        category: "java",
        title: `${name} necesita otra versión de Java`,
        detail: `Pide ${what} de Java. ${rest.replace(/!$/, "")}. Casi siempre significa que el mod es para una versión más nueva de Minecraft.`,
        fix: selfFix,
      });
      continue;
    }
    add({
      key: missing ? `missing:${id}:${depId}` : `fabric:${id}:${depId}`,
      severity: "critical",
      category: "mods",
      title: missing
        ? `${name} necesita ${depName}, que no está instalado`
        : verb === "requires"
          ? `${name} necesita otra versión de ${depName}`
          : `${name} es incompatible con ${depName}`,
      detail: `Fabric: ${name} ${verb === "requires" ? "pide" : "no admite"} ${what} de ${depName}. ${rest.replace(/!$/, "")}`.trim(),
      ...(missing ? withInstall(installFix(depId, depName), selfFix) : { fix: verb === "requires" || !modForId(depId) ? selfFix : disableFix([modForId(depId)], `Desactivar ${depName}`), altFix: verb === "requires" ? undefined : selfFix }),
      searchQuery: missing ? depId : undefined,
    });
  }

  // Forge/NeoForge missing dependencies.
  for (const fm of logs.matchAll(/Mod ID: '([^']+)', Requested by: '([^']+)', Expected range: '([^']*)', Actual version: '([^']*)'/g)) {
    const [, depId, by, range, actual] = fm;
    const self = modForId(by);
    const missing = /MISSING/i.test(actual);
    if (depId === "forge" || depId === "neoforge" || depId === "minecraft") {
      add({
        key: depId === "minecraft" && self ? `mcver:${self.rel}` : `loaderver:${by}`,
        severity: "critical",
        category: depId === "minecraft" ? "mods" : "loader",
        title: depId === "minecraft"
          ? `${self ? nameOf(self) : by} no es para Minecraft ${mc}`
          : `${self ? nameOf(self) : by} necesita otra versión de ${depId === "neoforge" ? "NeoForge" : "Forge"}`,
        detail: depId === "minecraft"
          ? `Pide Minecraft ${range}. Descarga la versión del mod para ${mc}.`
          : `Pide ${depId === "neoforge" ? "NeoForge" : "Forge"} ${range} y la instancia tiene ${actual}. Actualiza el loader o usa otra versión del mod.`,
        fix: self ? disableFix([self], `Desactivar ${nameOf(self)}`) : null,
      });
      continue;
    }
    add({
      key: missing ? `missing:${by}:${depId}` : `forgever:${by}:${depId}`,
      severity: "critical",
      category: "mods",
      title: missing
        ? `${self ? nameOf(self) : by} necesita ${depId}, que no está instalado`
        : `${self ? nameOf(self) : by} necesita otra versión de ${depId}`,
      detail: `Pide ${depId} ${range}${missing ? "" : ` y tienes la ${actual}`}.`,
      ...(missing ? withInstall(installFix(depId), self ? disableFix([self], `Desactivar ${nameOf(self)}`) : null) : { fix: self ? disableFix([self], `Desactivar ${nameOf(self)}`) : null }),
      searchQuery: missing ? depId : undefined,
    });
  }

  // Forge's readable form of the same ("Mod X requires Y 1.2 or above / Currently, Y is not installed").
  for (const fm of logs.concat("\n", reportText).matchAll(/Mod ([\w-]+) requires ([\w-]+) ([^\n]*?)\s*\n\s*Currently, \2 is ([^\n]+)/g)) {
    const [, by, depId, range, current] = fm;
    if (findings.some((f) => f.key === `missing:${by}:${depId}` || f.key === `forgever:${by}:${depId}` || f.key === `loaderver:${by}`)) continue;
    const self = modForId(by);
    const missing = /not installed|no está instalado/i.test(current);
    if (LOADER_BUILTIN_IDS.has(depId)) continue; // already covered by the "Mod ID:" form when it's the loader
    add({
      key: missing ? `missing:${by}:${depId}` : `forgever:${by}:${depId}`,
      severity: "critical",
      category: "mods",
      title: missing ? `${self ? nameOf(self) : by} necesita ${depId}, que no está instalado` : `${self ? nameOf(self) : by} necesita otra versión de ${depId}`,
      detail: `Pide ${depId} ${range.trim()}${missing ? "" : ` y tienes ${current.trim()}`}.`,
      ...(missing ? withInstall(installFix(depId), self ? disableFix([self]) : null) : { fix: self ? disableFix([self]) : null }),
      searchQuery: missing ? depId : undefined,
    });
  }

  // The first mod frame of the stack trace that starts at `idx` (who called the thing that failed).
  const callerAt = (text, idx) => {
    let chunk = text.slice(idx, idx + 12000);
    const end = chunk.slice(1).search(/\n\s*\n|\nCaused by:/);
    if (end > 0) chunk = chunk.slice(0, end + 1);
    for (const f of chunk.matchAll(/^\s*at (?:[\w.-]+(?:@[\w.-]+)?\/{1,2})?([\w$.]+)\.[\w$<>]+\(/gm)) {
      if (IGNORED_FRAME_PREFIXES.some((p) => f[1].startsWith(p))) continue;
      const m = modForClass(f[1]);
      if (m) return m;
    }
    // Code a Mixin merged into Minecraft's classes is named "$abc000$modid$method".
    const mm = /\$[a-z]{3}\d{3}\$([a-z][a-z0-9_]{1,63})\$/.exec(chunk);
    return mm ? modForId(mm[1]) : null;
  };
  const shortClass = (cls) => cls.replace(/\//g, ".").split(".").pop();
  const isGameClass = (cls) => /^(net[./]minecraft|com[./]mojang)[./]/.test(cls);
  const loaderName = loader === "neoforge" ? "NeoForge" : loader === "forge" ? "Forge" : loader === "quilt" ? "Quilt" : "Fabric";
  const mcVersionFinding = (caller, what) =>
    add({
      key: `mcver:${caller.rel}`,
      severity: "likely",
      category: "mods",
      title: `${nameOf(caller)} no es para Minecraft ${mc}`,
      detail: `Usa ${what} de Minecraft que no existe en la ${mc}: el mod está hecho para otra versión. Busca la versión del mod para ${mc}.`,
      fix: disableFix([caller]),
    });

  // A class that isn't there: a missing library, or a mod for another version of something.
  let gameClassMissing = false;
  const seenClasses = new Set();
  for (const cm of errorText.matchAll(/(?:NoClassDefFoundError|ClassNotFoundException)(?::\s*|\s+)([\w$]+(?:[./][\w$]+)+)/g)) {
    const cls = cm[1].replace(/\./g, "/");
    if (seenClasses.has(cls) || /^(java|javax|jdk|sun)\//.test(cls)) continue;
    seenClasses.add(cls);
    const caller = callerAt(errorText, cm.index);
    if (isGameClass(cls)) {
      if (caller) mcVersionFinding(caller, `una parte (${shortClass(cls)})`);
      else gameClassMissing = true;
      continue;
    }
    const lib = KNOWN_LIBS.find((l) => l.prefixes.some((p) => cls.startsWith(p)) && (!l.onlyFabric || isFabricLike));
    const libId = lib ? lib.modId?.[loader] || lib.id : null;
    const owner = modForClass(cls) || (libId ? modForId(libId) : null);
    if (lib && !owner && !(libId && provided.has(libId))) {
      // slug null = not on Modrinth (CurseForge only, or always bundled inside other mods): no install button.
      const slug = isForgeLike && lib.forgeSlug ? lib.forgeSlug : lib.slug;
      add({
        key: `missing:${caller?.info?.mods[0]?.id || "?"}:${libId}`,
        severity: "critical",
        category: "mods",
        title: `${caller ? nameOf(caller) : "Un mod"} necesita ${lib.name}, que no está instalado`,
        detail: `El juego buscó ${shortClass(cls)}, que es parte de ${lib.name}, y no está. Instálalo${caller ? ` o desactiva ${nameOf(caller)}` : ""}.`,
        ...withInstall(slug ? installFix(libId, lib.name, slug) : null, caller ? disableFix([caller]) : null),
        searchQuery: slug,
      });
    } else if (owner && caller && owner !== caller) {
      add({
        key: `apiver:${caller.rel}:${owner.rel}`,
        severity: "likely",
        category: "mods",
        title: `${nameOf(caller)} necesita otra versión de ${nameOf(owner)}`,
        detail: `Busca ${shortClass(cls)}, que tu versión de ${nameOf(owner)} no tiene. Actualiza ${nameOf(owner)} o usa una versión de ${nameOf(caller)} hecha para la que tienes.`,
        fix: disableFix([caller]),
      });
    } else if (!owner && caller) {
      add({
        key: `missingcls:${caller.rel}`,
        severity: "possible",
        category: "mods",
        title: `A ${nameOf(caller)} le falta algo para funcionar`,
        detail: `Busca ${cls.replace(/\//g, ".")}, que no está en ningún mod instalado. Suele ser una librería que se instala aparte (mira la página del mod) o que el mod es para otra versión.`,
        fix: disableFix([caller]),
      });
    }
  }

  // A method/field that isn't there: two pieces built against different versions of each other.
  for (const em of errorText.matchAll(/java\.lang\.(NoSuchMethodError|NoSuchFieldError|AbstractMethodError|IncompatibleClassChangeError)(?::\s*([^\n]*))?/g)) {
    const [, kind, msg = ""] = em;
    let ownerCls = null;
    let caller = null;
    if (kind === "NoSuchMethodError") ownerCls = /'(?:[^' ]+ )?([\w$.]+)\.[\w$<>]+\(/.exec(msg)?.[1] || /^([\w$./]+)\.[\w$<>]+\(/.exec(msg.trim())?.[1];
    else if (kind === "NoSuchFieldError") ownerCls = /Class ([\w$.]+) does not have member field/.exec(msg)?.[1];
    else if (kind === "AbstractMethodError") {
      ownerCls = /of (?:interface|abstract class|class) ([\w$.]+)/.exec(msg)?.[1];
      const receiver = /Receiver class ([\w$.]+)/.exec(msg)?.[1];
      if (receiver) caller = modForClass(receiver);
    } else ownerCls = /(?:Found (?:interface|class)|class) ([\w$.]+)/.exec(msg)?.[1];
    caller = caller || callerAt(errorText, em.index);
    if (!ownerCls || !caller) continue;
    ownerCls = ownerCls.replace(/\//g, ".");
    if (isGameClass(ownerCls)) {
      mcVersionFinding(caller, `una función (${shortClass(ownerCls)})`);
      continue;
    }
    if (/^(net\.fabricmc\.loader|net\.minecraftforge\.(fml|common|eventbus)|net\.neoforged\.(fml|neoforge|bus))\./.test(ownerCls)) {
      add({
        key: `loaderver:${caller.rel}`,
        severity: "likely",
        category: "loader",
        title: `${nameOf(caller)} necesita otra versión de ${loaderName}`,
        detail: `Usa una función de ${loaderName} (${shortClass(ownerCls)}) que tu versión no tiene. Actualiza el loader de la instancia o usa otra versión del mod.`,
        fix: disableFix([caller]),
      });
      continue;
    }
    const owner = modForClass(ownerCls);
    if (!owner || owner === caller) continue;
    add({
      key: `apiver:${caller.rel}:${owner.rel}`,
      severity: "likely",
      category: "mods",
      title: `${nameOf(caller)} necesita otra versión de ${nameOf(owner)}`,
      detail: `${nameOf(caller)} usa una función de ${nameOf(owner)} (${shortClass(ownerCls)}) que tu versión no tiene: uno de los dos está desactualizado. Actualiza ${nameOf(owner)} o usa una versión de ${nameOf(caller)} hecha para la que tienes.`,
      fix: disableFix([caller]),
    });
  }

  // Mods known not to work together (whatever the crash says).
  const optifineMod = mods.find((m) => /optifine/i.test(path.basename(m.rel)) || [...(m.info?.packages || [])].some((p) => p.startsWith("net/optifine")));
  const findAny = (ids) => {
    for (const id of ids) {
      const m = id === "optifine" ? optifineMod : modForId(id);
      if (m && !findings.some((f) => f.key === `loader:${m.rel}`)) return m;
    }
    return null;
  };
  for (const c of KNOWN_CONFLICTS) {
    const ma = findAny(c.a);
    const mb = findAny(c.b);
    if (!ma || !mb || ma === mb) continue;
    const drop = c.drop === "a" ? ma : mb;
    add({
      key: `conflict:${[ma.rel, mb.rel].sort().join(":")}`,
      severity: "likely",
      category: "mods",
      title: `${nameOf(ma)} y ${nameOf(mb)} no funcionan juntos`,
      detail: c.why.replace(/\{a\}/g, nameOf(ma)).replace(/\{b\}/g, nameOf(mb)),
      fix: disableFix([drop], `Desactivar ${nameOf(drop)}`),
    });
  }

  // Plain-text errors with one clear meaning.
  const TEXT_PATTERNS = [
    {
      re: /No space left on device|There is not enough space on the disk|no hay espacio suficiente en el disco/i,
      anyLog: true,
      key: "disk-full", severity: "critical", category: "system",
      title: "El disco está lleno",
      detail: "El juego no pudo escribir un archivo porque no queda espacio. Libera espacio en el disco y vuelve a jugar.",
    },
    {
      re: /session\.lock[^\n]*(?:already locked|locked by)|AlreadyLockedException|Failed to check session lock/i,
      anyLog: true,
      key: "session-lock", severity: "likely", category: "world",
      title: "El mundo está abierto en otra parte",
      detail: "Otra ventana de Minecraft (o un servidor) tiene abierto este mundo. Ciérrala —o reinicia el equipo si no ves ninguna— y vuelve a entrar.",
    },
    {
      re: /AccessDeniedException|IOException: Access is denied|being used by another process|Acceso denegado/i,
      key: "access-denied", severity: "likely", category: "system",
      title: "Windows no dejó usar un archivo del juego",
      detail: "Un antivirus, OneDrive u otro programa lo tenía bloqueado. Añade la carpeta .alaunchi a las exclusiones del antivirus o cierra el programa que lo usa, y vuelve a jugar.",
    },
    {
      re: /A single server tick took [\d.]+ seconds|ServerHangWatchdog|Considering it to be crashed, server will forcibly shutdown/,
      anyLog: true,
      key: "watchdog", severity: "likely", category: "world",
      title: "El mundo se quedó congelado y el juego lo cerró",
      detail: "El servidor interno estuvo más de un minuto sin responder. Suele ser generación de mundo muy pesada, poca memoria o un mod atascado en un bucle (si abajo sale un causante, empieza por él).",
    },
    {
      re: /java\.lang\.StackOverflowError/,
      key: "stackoverflow", severity: "possible", category: "mods",
      title: "Algo entró en un bucle infinito",
      detail: "Un mod se llamó a sí mismo sin parar (StackOverflowError). Si abajo sale un causante, empieza por él; si no, suele ser un choque entre dos mods que tocan lo mismo.",
    },
    {
      re: /ClassLoaders\$AppClassLoader cannot be cast to (?:class )?java\.net\.URLClassLoader/,
      key: "java-too-new", severity: "critical", category: "java",
      title: `Esta versión de ${loaderName} necesita Java 8`,
      detail: "El juego se abrió con una Java más nueva y los Forge antiguos (1.16 o anterior) no arrancan con ella.",
    },
    {
      re: /Failed to open OpenAL device|Failed to initialize OpenAL|OpenAL initialization failed|ALC_INVALID_DEVICE/i,
      onlyReport: true,
      key: "audio", severity: "likely", category: "other",
      title: "El sonido no pudo arrancar",
      detail: "Minecraft no encontró una salida de audio que funcione. Conecta unos auriculares o altavoces, o cambia la salida de audio predeterminada de Windows, y vuelve a abrir el juego.",
    },
    {
      re: /Couldn't load chunk|Chunk file at \[[^\]]+\] is in the wrong location|Failed to (?:read|load) chunk|Exception reading [^\n]*\.mca/i,
      key: "world-chunks", severity: "possible", category: "world",
      title: "Hay partes del mundo dañadas",
      detail: "Algunos chunks no se pudieron leer, normalmente por cerrar el juego de golpe o por un mod quitado que tenía bloques en el mundo. Si solo falla en un mundo, usa una copia de seguridad o prueba en un mundo nuevo.",
    },
  ];
  for (const p of TEXT_PATTERNS) {
    if (!p.re.test(p.onlyReport ? reportText : p.anyLog ? allText : errorText)) continue;
    const { re, onlyReport, anyLog, ...f } = p;
    add({ ...f, fix: null });
  }

  // Unsupported class file major version (ASM can't read a class): a mod built for a newer Java.
  const major = /Unsupported class file major version (\d+)/.exec(errorText);
  if (major && !findings.some((f) => f.key === "java-version")) {
    const caller = callerAt(errorText, major.index);
    add({
      key: "java-version",
      severity: "critical",
      category: "java",
      title: caller ? `${nameOf(caller)} está hecho para Java ${Number(major[1]) - 44}` : `Un mod está hecho para Java ${Number(major[1]) - 44}`,
      detail: `El loader de Minecraft ${mc} no entiende código de Java ${Number(major[1]) - 44}: casi siempre es un mod para una versión más nueva de Minecraft.${caller ? "" : " Mira los mods añadidos o actualizados hace poco."}`,
      fix: caller ? disableFix([caller]) : null,
    });
  }

  // _JAVA_OPTIONS / JAVA_TOOL_OPTIONS: a Windows environment variable that overrides the launcher's Java settings.
  const javaEnv = /Picked up (_JAVA_OPTIONS|JAVA_TOOL_OPTIONS):\s*([^\n]*)/.exec(allText);
  if (javaEnv) {
    const limitsRam = /-Xmx|-Xms|-XX:MaxHeap/i.test(javaEnv[2]);
    add({
      key: "java-env",
      severity: limitsRam ? "likely" : "possible",
      category: "java",
      title: `Windows tiene ${javaEnv[1]}, que cambia cómo arranca Java`,
      detail: `Esa variable de entorno (${redact(javaEnv[2]).slice(0, 120)}) se aplica a toda la Java del equipo${limitsRam ? " y aquí cambia la memoria que tiene Minecraft" : ""}. Quítala en Windows → "Editar las variables de entorno del sistema" → Variables de entorno, y reinicia ALaunchi.`,
      fix: null,
    });
  }

  // options.txt that Minecraft can't read.
  if (/Failed to load options|Failed to parse options/i.test(allText) && fsSync.existsSync(path.join(instanceDir, "options.txt"))) {
    add({
      key: "config:options.txt",
      severity: "likely",
      category: "config",
      title: "Las opciones del juego (options.txt) están rotas",
      detail: "Minecraft no pudo leer options.txt. Restablecerlo guarda una copia (.alaunchi-bak) y el juego crea uno nuevo con las opciones por defecto (se pierden teclas, vídeo y sonido personalizados).",
      fix: { kind: "reset-config", label: "Restablecer opciones", path: "options.txt" },
    });
  }

  // A world whose level.dat can't be read: Minecraft keeps the previous one as level.dat_old.
  for (const wm of errorText.matchAll(/(?:Exception|Failed|Error|Couldn't)[^\n]*?saves[\\/]([^\\/\n"'<>|]+)[\\/]level\.dat\b/gi)) {
    const world = wm[1];
    const worldDir = path.join(instanceDir, "saves", world);
    if (!fsSync.existsSync(worldDir)) continue;
    const hasOld = fsSync.existsSync(path.join(worldDir, "level.dat_old"));
    add({
      key: `world-level:${world}`,
      severity: "critical",
      category: "world",
      title: `El mundo "${world}" está dañado`,
      detail: hasOld
        ? "No se puede leer su level.dat (los datos principales del mundo). Minecraft guarda la versión anterior: restaurarla puede perder lo último que hiciste en ese mundo. El archivo dañado se conserva como level.dat.alaunchi-bak."
        : "No se puede leer su level.dat (los datos principales del mundo) y no hay copia anterior. Si tienes una copia de seguridad del mundo, úsala.",
      fix: hasOld ? { kind: "restore-level-dat", label: "Restaurar la copia anterior", world } : null,
    });
  }

  // Broken loader install / damaged game files reported by the JVM.
  if (gameClassMissing || /Mod ID 'minecraft'.{0,40}MISSING|Could not find or load main class/i.test(allText)) {
    add({
      key: "loader-broken",
      severity: "critical",
      category: "loader",
      title: `La instalación de ${loader === "neoforge" ? "NeoForge" : loader === "forge" ? "Forge" : "Minecraft"} está incompleta`,
      detail: "Al juego le faltan clases de Minecraft o del loader: la instalación se cortó o se dañó.",
      fix: { kind: "reset-loader", label: "Reinstalar al jugar", loaderType: loader },
    });
  }
  if (/error remapping game jars|remappedJars/i.test(allText) && isFabricLike) {
    add({
      key: "fabric-cache",
      severity: "critical",
      category: "loader",
      title: "La caché de Fabric de esta instancia está dañada",
      detail: "Fabric no pudo preparar los archivos del juego (carpeta .fabric). Se rehace sola al borrarla.",
      fix: { kind: "clear-fabric-cache", label: "Borrar caché de Fabric" },
    });
  }
  for (const zm of allText.matchAll(/(?:ZipException|zip END header not found|invalid LOC header|error in opening zip file|ZipError)[^\n]*?([A-Za-z]:[\\/][^\s"'<>|]+?\.jar|\/[^\s"'<>|]+?\.jar)/gi)) {
    const bad = zm[1];
    const rel = path.relative(instanceDir, bad).replace(/\\/g, "/");
    if (!rel.startsWith("..") && rel.startsWith("mods/")) {
      const m = mods.find((x) => x.rel === rel);
      add({
        key: `damaged:${rel}`,
        severity: "critical",
        category: "files",
        title: `El mod ${path.basename(rel)} está dañado`,
        detail: "Java no lo pudo abrir como zip.",
        fix: snapshotPaths.has(rel) && ctx.canRepairFromSource ? { kind: "repair-files", label: "Volver a descargar" } : m ? disableFix([m], "Desactivarlo") : null,
      });
    } else if (!path.relative(ctx.cacheDir, bad).startsWith("..")) {
      add({
        key: `damaged-cache:${bad}`,
        severity: "critical",
        category: "files",
        title: `Un archivo de Minecraft está dañado (${path.basename(bad)})`,
        detail: "Java no lo pudo abrir. Se vuelve a descargar solo al borrarlo.",
        fix: { kind: "delete-cache-files", label: "Volver a descargar al jugar", paths: [bad] },
      });
    }
  }

  // Graphics driver.
  const frame = /Problematic frame:\s*\n#\s*(.+)/.exec(jvmText)?.[1] || "";
  if (/atio6axx|atig6|amdxx|nvoglv|nvd3d|ig\d+icd|igxelp|igdumd|opengl32|libGL|lwjgl\.dll|glfw/i.test(frame) ||
      /GLFW error (?:65542|65543)|WGL: The driver does not appear to support OpenGL|Pixel format not accelerated|Couldn't set pixel format/i.test(allText)) {
    const shaders = [...byId.keys()].some((id) => /^(iris|oculus|optifine|optifabric)$/i.test(id));
    add({
      key: "graphics",
      severity: "likely",
      category: "graphics",
      title: "El fallo viene del driver de la tarjeta gráfica",
      detail: `El error ocurrió dentro del driver gráfico${frame ? ` (${frame.trim().slice(0, 80)})` : ""}. Actualiza los drivers de la gráfica${shaders ? " y prueba sin shaders" : ""}.`,
      fix: null,
    });
  }

  // Broken config file.
  for (const cm of allText.matchAll(/(?:Failed (?:to )?load(?:ing)? config(?:uration)?(?: file)?|Error loading config|ParsingException|Could not parse config|Failed to parse)[^\n]*?((?:config|defaultconfigs)[\\/][^\s"'<>|,)]+\.(?:toml|json5?|cfg|properties|yml|yaml|txt))/gi)) {
    const rel = cm[1].replace(/\\/g, "/");
    if (!fsSync.existsSync(path.join(instanceDir, rel))) continue;
    add({
      key: `config:${rel}`,
      severity: "likely",
      category: "config",
      title: `La configuración ${path.basename(rel)} está rota`,
      detail: `El juego no pudo leer ${rel}. Restablecerla guarda una copia (.alaunchi-bak) y el mod la vuelve a crear con los valores por defecto.`,
      fix: { kind: "reset-config", label: "Restablecerla", path: rel },
    });
  }

  // The mod(s) the crash points at: "Suspected mods", mixins in the stack trace, frames.
  let culprits = [];
  if (reportText || /Exception|Error/.test(logs)) {
    const scores = new Map();
    const bump = (m, n, why) => {
      if (!m) return;
      const s = scores.get(m) || { score: 0, why: new Set() };
      s.score += n;
      s.why.add(why);
      scores.set(m, s);
    };
    const source = reportText || logs.slice(-200000);
    const suspected = /Suspected Mods?:\s*\n([\s\S]*?)(?:\n\s*\n|\nStacktrace:)/i.exec(source)?.[1] || "";
    for (const sm of suspected.matchAll(/^\s*(.+?) \(([^)]+)\)(?:, Version:|\s*$)/gm)) bump(modForId(sm[2]), 4, "el informe lo señala como sospechoso");
    const mixinsSection = /Mixins in Stacktrace:\s*\n([\s\S]*?)(?:\n\s*\n|\n-- )/i.exec(source)?.[1] || "";
    for (const mm of mixinsSection.matchAll(/([\w.-]+\.json):/g)) bump(mixinIndex.get(mm[1]), 2, "modifica el código que falló (Mixin)");
    for (const mm of source.matchAll(/Mixin (?:apply|transformation) (?:for mod (\S+) )?failed[^\n]*?([\w.-]+\.json)/gi)) {
      bump(mm[1] ? modForId(mm[1]) : null, 3, "uno de sus Mixin falló");
      bump(mixinIndex.get(mm[2]), 3, "uno de sus Mixin falló");
    }
    // The loader saying outright whose code blew up.
    for (const mm of source.matchAll(/Could not execute entrypoint stage '\w+' due to errors, provided by '([\w-]+)'/g)) bump(modForId(mm[1]), 6, "falló al arrancar (su punto de entrada)");
    for (const mm of source.matchAll(/LoaderExceptionModCrash: Caught exception from [^\n]*?\(([\w-]+)\)/g)) bump(modForId(mm[1]), 6, "el loader dice que el error salió de él");
    for (const mm of source.matchAll(/Failed to create mod instance\. ModID: ([\w-]+)/g)) bump(modForId(mm[1]), 6, "no se pudo crear (falló al cargar)");
    for (const mm of source.matchAll(/ModLoadingException: [^\n]*?\(([\w-]+)\) (?:has failed to load correctly|encountered an error)/g)) bump(modForId(mm[1]), 6, "el loader dice que falló al cargar");
    for (const mm of source.matchAll(/^-- MOD ([\w-]+) --\s*\nDetails:[\s\S]{0,400}?Failure message:/gm)) bump(modForId(mm[1]), 5, "el informe lo marca como el mod que falló");
    for (const mm of source.matchAll(/Mixin \[([\w.-]+\.json):[\w$.]+ from mod ([\w-]+)\]/g)) {
      bump(modForId(mm[2]) || mixinIndex.get(mm[1]), 3, "uno de sus Mixin falló");
    }
    for (const mm of source.matchAll(/(?:InvalidInjectionException|InjectionError|MixinApplyError|MixinTransformerError|InvalidMixinException|Critical injection failure|MixinPreProcessorException)[^\n]*?([\w.-]+\.json)/g)) {
      bump(mixinIndex.get(mm[1]), 3, "uno de sus Mixin falló");
    }
    // A ticking entity / block entity: its id's namespace is the mod that added it.
    const ticked = /-- (?:Entity|Block entity|Tile entity) being ticked --\s*\nDetails:\n([\s\S]*?)(?:\n\s*\n|\n-- )/i.exec(source)?.[1] || "";
    const tickedNs = /(?:Entity Type|Name|Block):\s*(?:Block\{)?([a-z0-9_.-]+):[a-z0-9_/.-]+/i.exec(ticked)?.[1];
    if (tickedNs && tickedNs !== "minecraft") bump(modForId(tickedNs), 4, "lo que falla en el mundo es algo que añade este mod");
    for (const mm of source.matchAll(/\$[a-z]{3}\d{3}\$([a-z][a-z0-9_]{1,63})\$/g)) bump(modForId(mm[1]), 1, "aparece en el error");
    // Frames of the first exception (and its causes), stronger the higher up.
    const excerptStart = Math.max(0, source.search(/^Description:|Exception|Error:/m));
    const frames = [...source.slice(excerptStart, excerptStart + 20000).matchAll(/^\s*at (?:[\w.-]+(?:@[\w.-]+)?\/{1,2})?([\w$.]+)\.[\w$<>]+\(/gm)].map((f) => f[1]);
    let rank = 0;
    for (const cls of frames) {
      if (IGNORED_FRAME_PREFIXES.some((p) => cls.startsWith(p))) continue;
      bump(modForClass(cls), rank < 3 ? 3 : 1, "su código aparece en el error");
      if (++rank > 40) break;
    }
    // Earlier crash reports of this streak that point at the same mod make it more certain.
    for (const older of recentReports.slice(1, 4)) {
      const text = noColors(await readTail(older.path, 128 * 1024));
      const olderSuspected = /Suspected Mods?:\s*\n([\s\S]*?)(?:\n\s*\n|\nStacktrace:)/i.exec(text)?.[1] || "";
      const hit = new Set();
      for (const sm of olderSuspected.matchAll(/^\s*(.+?) \(([^)]+)\)(?:, Version:|\s*$)/gm)) hit.add(modForId(sm[2]));
      const st = Math.max(0, text.search(/^Description:|Exception|Error:/m));
      for (const f of [...text.slice(st, st + 12000).matchAll(/^\s*at (?:[\w.-]+(?:@[\w.-]+)?\/{1,2})?([\w$.]+)\.[\w$<>]+\(/gm)].slice(0, 30)) {
        if (!IGNORED_FRAME_PREFIXES.some((p) => f[1].startsWith(p))) hit.add(modForClass(f[1]));
      }
      for (const m of hit) if (m && scores.has(m)) bump(m, 2, "también aparece en crasheos anteriores");
    }
    const ranked = [...scores.entries()].filter(([, s]) => s.score >= 3).sort((a, b) => b[1].score - a[1].score).slice(0, 2);
    culprits = ranked.map(([m]) => m);
    for (const [m, s] of ranked) {
      add({
        key: `culprit:${m.rel}`,
        severity: s.score >= 6 ? "likely" : "possible",
        category: "mods",
        title: `${nameOf(m)} parece ser el causante`,
        detail: `${[...s.why].join("; ").replace(/^./, (c) => c.toUpperCase())}. Desactívalo y prueba: si deja de fallar, busca otra versión del mod o una incompatibilidad con otro.`,
        fix: disableFix([m], `Desactivar ${nameOf(m)}`),
      });
    }
  }

  // A thing in the world (entity / block entity) that crashes the game every time it ticks.
  const tickDesc = /^Description:\s*Ticking (entity|block entity|tile entity)/im.exec(reportText);
  if (tickDesc) {
    const isEntity = /^entity$/i.test(tickDesc[1]);
    const section = /-- (?:Entity|Block entity|Tile entity) being ticked --\s*\nDetails:\n([\s\S]*?)(?:\n\s*\n|\n-- )/i.exec(reportText)?.[1] || "";
    const type = /(?:Entity Type|Name|Block):\s*(?:Block\{)?([a-z0-9_.-]+:[a-z0-9_/.-]+)/i.exec(section)?.[1] || null;
    const loc = /(?:Entity's Exact location|Block location):\s*(?:World:\s*)?\(?\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)/i.exec(section);
    const where = loc ? ` en ${loc.slice(1, 4).map((n) => Math.floor(Number(n))).join(", ")}` : "";
    // Forge/NeoForge can delete the erroring thing instead of crashing (per-world serverconfig).
    let fix = null;
    if (isForgeLike) {
      const levelName = /Level name:\s*(?:ServerLevel\[)?([^\]\n]+)\]?/.exec(reportText)?.[1]?.trim();
      const worlds = [];
      for (const name of await fs.readdir(path.join(instanceDir, "saves")).catch(() => [])) {
        const st = await fs.stat(path.join(instanceDir, "saves", name, "level.dat")).catch(() => null);
        if (st) worlds.push({ name, mtimeMs: st.mtimeMs });
      }
      const world = worlds.find((w) => w.name === levelName) || worlds.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
      const keys = isEntity ? ["removeErroringEntities"] : ["removeErroringBlockEntities", "removeErroringTileEntities"];
      for (const file of world ? ["forge-server.toml", "neoforge-server.toml"] : []) {
        const rel = `saves/${world.name}/serverconfig/${file}`;
        const text = await fs.readFile(path.join(instanceDir, rel), "utf8").catch(() => null);
        const key = text && keys.find((k) => new RegExp(`^\\s*${k}\\s*=\\s*false`, "m").test(text));
        if (key) {
          fix = { kind: "set-toml-option", label: "Borrarlo en vez de cerrar el juego", path: rel, key, value: true };
          break;
        }
      }
    }
    add({
      key: "ticking",
      severity: "likely",
      category: "world",
      title: isEntity ? "Una criatura u objeto del mundo cierra el juego" : "Un bloque del mundo cierra el juego",
      detail: `${type ? `${type}${where}` : `Algo${where}`} falla cada vez que se actualiza, así que el juego se cierra al entrar en esa zona.${fix ? ` El arreglo activa una opción de ${loaderName} para que lo borre en vez de cerrarse: se pierde ${isEntity ? "esa criatura u objeto" : "ese bloque y lo que tenga dentro"}.` : " Si es de un mod, actualizarlo o desactivarlo suele arreglarlo."}`,
      fix,
    });
  }

  // Shaders: a classic source of driver crashes. Only when something points that way.
  const shaderState = await readShaderState(instanceDir);
  if (shaderState.active) {
    const shaderMods = new Set(["iris", "oculus", "optifine"]);
    const pointsAtShaders =
      findings.some((f) => f.category === "graphics") ||
      culprits.some((m) => m.info?.mods.some((mi) => shaderMods.has(mi.id)) || m === optifineMod) ||
      /net\.irisshaders|net\.coderbot\.iris|net\.optifine\.shaders|ShaderPack|shaderpack|Failed to (?:compile|link) shader/i.test(errorText);
    if (pointsAtShaders) {
      add({
        key: "shaders",
        severity: "likely",
        category: "graphics",
        title: "Los shaders pueden ser la causa",
        detail: `Tienes activado ${shaderState.pack ? `"${shaderState.pack}"` : "un shader"}. Prueba a jugar sin shaders: si deja de fallar, usa otro shader, uno más ligero o una versión más nueva.`,
        fix: { kind: "disable-shaders", label: "Desactivar shaders" },
      });
    }
  }

  // Graphics card the game actually used (crash report "System Details").
  const renderer = (/Backend API:\s*([^\n]+)/.exec(reportText) || /OpenGL:\s*([^\n]+?) GL version/.exec(reportText) || /GL info:\s*'?\s*([^'\n]+)/.exec(reportText))?.[1]?.trim() || "";
  const cards = [...reportText.matchAll(/Graphics card #\d+ name:\s*([^\n]+)/g)].map((m) => m[1].trim());
  if (/GDI Generic|Microsoft Basic Render|llvmpipe|softpipe|Software Rasterizer/i.test(`${renderer}\n${cards.join("\n")}`)) {
    add({
      key: "no-gpu-driver",
      severity: "critical",
      category: "graphics",
      title: "La tarjeta gráfica no tiene driver instalado",
      detail: "Windows está usando un driver genérico sin aceleración y Minecraft no puede funcionar así. Instala el driver de tu gráfica desde la web de NVIDIA, AMD o Intel y reinicia el equipo.",
      fix: null,
    });
  } else if (/Intel|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics/i.test(renderer) && cards.some((c) => /NVIDIA|GeForce|Radeon RX|Radeon Pro|Arc A\d/i.test(c))) {
    const dedicated = cards.find((c) => /NVIDIA|GeForce|Radeon RX|Radeon Pro|Arc A\d/i.test(c));
    add({
      key: "integrated-gpu",
      severity: findings.some((f) => f.category === "graphics") ? "likely" : "possible",
      category: "graphics",
      title: "Minecraft está usando la gráfica integrada",
      detail: `El juego usa ${renderer.slice(0, 60)} aunque el equipo tiene ${dedicated.slice(0, 60)}. En Windows → Configuración → Pantalla → Gráficos, añade ${ctx.javaPath && ctx.javaPath !== "java" ? `"${redact(ctx.javaPath).replace(/java\.exe$/i, "javaw.exe")}"` : "el javaw.exe de ALaunchi"} y elige "Alto rendimiento".`,
      fix: null,
    });
  }

  // Mods that changed since the last time the game closed fine.
  const lastCleanAt = Number(meta?.crashStats?.lastCleanAt) || 0;
  if (lastCleanAt && meta?.crashStats?.consecutive) {
    const changed = mods.filter((m) => m.changedAt > lastCleanAt + 1000).sort((a, b) => b.changedAt - a.changedAt);
    if (changed.length && changed.length <= 25) {
      const own = changed.filter((m) => !snapshotPaths.has(m.rel));
      const when = new Date(lastCleanAt).toLocaleString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
      add({
        key: "recent-changes",
        severity: changed.length <= 3 ? "likely" : "possible",
        category: "mods",
        title: changed.length === 1 ? `Empezó a fallar después de añadir o actualizar ${nameOf(changed[0])}` : `Empezó a fallar después de cambiar ${changed.length} mods`,
        detail: `La última vez que el juego se cerró bien fue el ${when}. Desde entonces han cambiado: ${changed.slice(0, 10).map((m) => nameOf(m)).join(", ")}${changed.length > 10 ? "…" : ""}.${own.length < changed.length ? " Algunos llegaron con la actualización del modpack: si el problema es de esos, avisa al creador." : ""}`,
        fix: own.length ? disableFix(own, own.length === 1 ? `Desactivar ${nameOf(own[0])}` : `Desactivar esos ${own.length} mods`) : null,
      });
    }
  }

  // Free disk space (games, worlds and Java all write a lot).
  try {
    const sf = await fs.statfs(instanceDir);
    const freeMb = Math.round((Number(sf.bavail) * Number(sf.bsize)) / 1048576);
    if (freeMb < 1536) {
      add({
        key: "disk-full",
        severity: freeMb < 400 ? "critical" : "possible",
        category: "system",
        title: freeMb < 400 ? "El disco está lleno" : "Queda poco espacio en el disco",
        detail: `Quedan ${freeMb} MB libres. Minecraft necesita espacio para guardar el mundo, los registros y la caché: libera algo de espacio.`,
        fix: null,
      });
    }
  } catch {}

  if (manualCrash) {
    add({
      key: "manual-crash",
      severity: "info",
      category: "other",
      title: "El último cierre lo provocaste tú (F3 + C)",
      detail: "Mantener pulsadas F3 y C cierra el juego a propósito para depurar. No es un error: se ha mirado el crasheo anterior.",
      fix: null,
    });
  }

  // 4) Files ───────────────────────────────────────────────────────────────
  // The modpack's own content (online instances): size + SHA-256 like mc:install-snapshot.
  if (snapshotFiles) {
    const removed = new Set(Array.isArray(meta.removedOptionalPaths) ? meta.removedOptionalPaths : []);
    const toCheck = snapshotFiles.filter((f) => f && typeof f.path === "string" && !ctx.isPlayerEditableFile(f.path));
    const bad = [];
    for (let i = 0; i < toCheck.length; i++) {
      const f = toCheck[i];
      if (i % 10 === 0) onProgress(`Comprobando archivos del modpack (${i + 1}/${toCheck.length})`, 0.45 + 0.25 * (i / toCheck.length));
      let p = path.join(instanceDir, f.path);
      if (f.required === false && /\.jar$/i.test(f.path) && fsSync.existsSync(`${p}${ctx.disabledSuffix}`)) p = `${p}${ctx.disabledSuffix}`;
      const st = await fs.stat(p).catch(() => null);
      if (!st) {
        if (f.required !== false && !removed.has(f.path)) bad.push({ path: f.path, why: "falta" });
        continue;
      }
      if (f.size === 0) continue;
      if (st.size !== f.size || (await ctx.hashFile(p).catch(() => null)) !== f.hash) bad.push({ path: f.path, why: "dañado" });
    }
    if (bad.length) {
      add({
        key: "pack-files",
        severity: "critical",
        category: "files",
        title: bad.length === 1 ? "1 archivo del modpack falta o está dañado" : `${bad.length} archivos del modpack faltan o están dañados`,
        detail: bad.slice(0, 10).map((b) => `${b.path} (${b.why})`).join(", ") + (bad.length > 10 ? "…" : ""),
        fix: ctx.canRepairFromSource ? { kind: "repair-files", label: "Volver a descargarlos" } : null,
      });
    }
  }

  // Minecraft itself: client jar + libraries (sha1 published by Mojang), assets (size).
  const versionJsonPath = path.join(ctx.cacheDir, "versions", mc, `${mc}.json`);
  const versionJson = await fs.readFile(versionJsonPath, "utf8").then(JSON.parse, () => null);
  if (versionJson) {
    onProgress("Comprobando Minecraft", 0.72);
    const badGame = [];
    const clientJar = path.join(ctx.cacheDir, "versions", mc, `${mc}.jar`);
    const clientSha1 = versionJson.downloads?.client?.sha1;
    if (clientSha1 && fsSync.existsSync(clientJar) && (await ctx.hashFileSha1(clientJar).catch(() => null)) !== clientSha1) badGame.push(clientJar);
    const platform = process.platform.replace("win32", "windows").replace("darwin", "osx");
    for (const lib of versionJson.libraries || []) {
      if (lib.rules) {
        const allowed = lib.rules.every((rule) => {
          if (rule.action === "allow") return !rule.os || rule.os.name === platform;
          if (rule.action === "disallow") return rule.os && rule.os.name !== platform;
          return true;
        });
        if (!allowed) continue;
      }
      const a = lib.downloads?.artifact;
      if (!a?.path || !a.sha1) continue;
      const p = path.join(ctx.librariesDir, a.path);
      const st = await fs.stat(p).catch(() => null);
      if (!st) continue; // missing ones are downloaded at launch anyway
      if ((a.size && st.size !== a.size) || (await ctx.hashFileSha1(p).catch(() => null)) !== a.sha1) badGame.push(p);
    }
    onProgress("Comprobando recursos de Minecraft", 0.8);
    const indexPath = path.join(ctx.assetsDir, "indexes", `${versionJson.assetIndex?.id}.json`);
    const index = await fs.readFile(indexPath, "utf8").then(JSON.parse, () => null);
    let badAssets = 0;
    if (index?.objects) {
      for (const obj of Object.values(index.objects)) {
        const p = path.join(ctx.assetsDir, "objects", obj.hash.slice(0, 2), obj.hash);
        const st = await fs.stat(p).catch(() => null);
        if (st && obj.size !== undefined && st.size !== obj.size) {
          badGame.push(p);
          badAssets++;
        }
      }
    }
    if (badGame.length) {
      const nonAssets = badGame.length - badAssets;
      add({
        key: "game-files",
        severity: "critical",
        category: "files",
        title: "Hay archivos de Minecraft dañados",
        detail: [
          nonAssets ? `${nonAssets} ${nonAssets === 1 ? "archivo" : "archivos"} del juego o sus librerías` : "",
          badAssets ? `${badAssets} ${badAssets === 1 ? "recurso" : "recursos"} (texturas, sonidos)` : "",
        ].filter(Boolean).join(" y ") + " no coinciden con lo que publica Mojang. Se vuelven a descargar al jugar.",
        fix: { kind: "delete-cache-files", label: "Volver a descargar al jugar", paths: badGame },
      });
    }
  }

  // Forge/NeoForge install: processor outputs + its libraries.
  if (isForgeLike) {
    onProgress(`Comprobando ${loader === "neoforge" ? "NeoForge" : "Forge"}`, 0.88);
    const prefix = `${loader}-`;
    let names = [];
    try {
      names = (await fs.readdir(ctx.cacheDir)).filter((n) => n.startsWith(prefix) && n.endsWith("-outputs.json"));
    } catch {}
    const brokenCaches = [];
    const badLibs = [];
    for (const n of names) {
      const outputsPath = path.join(ctx.cacheDir, n);
      const profilePath = outputsPath.replace(/-outputs\.json$/, "-profile.json");
      const outputs = await fs.readFile(outputsPath, "utf8").then(JSON.parse, () => null);
      const profile = await fs.readFile(profilePath, "utf8").then(JSON.parse, () => null);
      // Only installs for this instance's Minecraft version (the loader's version.json inherits from it).
      if (profile?.inheritsFrom && profile.inheritsFrom !== mc) continue;
      if (!Array.isArray(outputs) || !outputs.every(ctx.isUsableLaunchFile)) brokenCaches.push(outputsPath, profilePath);
      for (const lib of profile?.libraries || []) {
        const a = lib.downloads?.artifact;
        if (!a?.path || !a.sha1) continue;
        const p = path.join(ctx.librariesDir, a.path);
        const st = await fs.stat(p).catch(() => null);
        if (!st) continue;
        if ((a.size && st.size !== a.size) || (await ctx.hashFileSha1(p).catch(() => null)) !== a.sha1) badLibs.push(p);
      }
    }
    if (brokenCaches.length || badLibs.length) {
      add({
        key: "loader-broken",
        severity: "critical",
        category: "loader",
        title: `La instalación de ${loader === "neoforge" ? "NeoForge" : "Forge"} está incompleta o dañada`,
        detail: `${brokenCaches.length ? "Faltan archivos que genera su instalador. " : ""}${badLibs.length ? `${badLibs.length} ${badLibs.length === 1 ? "librería está dañada" : "librerías están dañadas"}. ` : ""}Se reinstala la próxima vez que juegues.`,
        fix: { kind: "reset-loader", label: "Reinstalar al jugar", loaderType: loader, paths: [...brokenCaches, ...badLibs] },
      });
    }
  }

  // Java runtime of this version.
  if (ctx.javaMajor && ctx.javaPath && ctx.javaPath !== "java") {
    onProgress(`Comprobando Java ${ctx.javaMajor}`, 0.95);
    const works = await ctx.execFile(ctx.javaPath, ["-version"], { timeout: 15000 }).then(() => true, () => false);
    if (!works) {
      add({
        key: "java-broken",
        severity: "critical",
        category: "java",
        title: `Java ${ctx.javaMajor} está dañado`,
        detail: "La Java que usa esta versión no arranca. Se vuelve a descargar al jugar.",
        fix: { kind: "reinstall-java", label: "Volver a descargar al jugar", major: ctx.javaMajor },
      });
    }
  }

  onProgress("Listo", 1);
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // A piece of the error itself, for the report the player can copy.
  let excerpt = "";
  if (reportText) {
    const start = reportText.indexOf("Description:");
    excerpt = reportText.slice(Math.max(0, start), Math.max(0, start) + 6000).split("\n").slice(0, 60).join("\n");
  } else if (jvmText) {
    excerpt = jvmText.split("\n").slice(0, 30).join("\n");
  } else {
    const lines = logs.split(/\r?\n/);
    const i = lines.findIndex((l) => /Exception|Error|FATAL|Mod resolution|Missing or unsupported/.test(l));
    excerpt = i >= 0 ? lines.slice(Math.max(0, i - 3), i + 40).join("\n") : "";
  }

  // How many crash reports in a row (newest first) share the same description.
  let repeats = report ? 1 : 0;
  while (repeats < recentReports.length && recentReports[repeats].description === report.description) repeats++;

  return {
    findings,
    repeats,
    lastCrashAt,
    crashReport: report ? path.basename(report.path) : null,
    description: /^Description:\s*(.+)$/m.exec(reportText)?.[1]?.trim() || null,
    excerpt: redact(excerpt).slice(0, 8000),
    modsScanned: mods.length,
  };
}

// ── Shaders ──────────────────────────────────────────────────────────────────

/** Shader config files a "disable-shaders" fix may touch, relative to the instance. */
const SHADER_CONFIGS = ["config/iris.properties", "config/oculus.properties", "optionsshaders.txt"];

/** Is a shader pack switched on (Iris / Oculus / OptiFine), and which one. */
async function readShaderState(instanceDir) {
  for (const rel of SHADER_CONFIGS) {
    const text = await fs.readFile(path.join(instanceDir, rel), "utf8").catch(() => null);
    if (!text) continue;
    const pack = /^shaderPack\s*=\s*(.*)$/m.exec(text)?.[1]?.trim() || "";
    if (rel === "optionsshaders.txt") {
      if (pack && !/^(OFF|\(internal\))$/i.test(pack)) return { active: true, pack, file: rel };
    } else if (/^enableShaders\s*=\s*true/m.test(text) && pack) {
      return { active: true, pack, file: rel };
    }
  }
  return { active: false, pack: null, file: null };
}

/** Turns shaders off in every config that has them on. Returns how many files changed. */
async function disableShaders(instanceDir) {
  let changed = 0;
  for (const rel of SHADER_CONFIGS) {
    const p = path.join(instanceDir, rel);
    const text = await fs.readFile(p, "utf8").catch(() => null);
    if (!text) continue;
    const next = rel === "optionsshaders.txt"
      ? text.replace(/^shaderPack\s*=.*$/m, "shaderPack=OFF")
      : text.replace(/^enableShaders\s*=\s*true/m, "enableShaders=false");
    if (next !== text) {
      await fs.writeFile(p, next);
      changed++;
    }
  }
  return changed;
}

/** Does this jar declare (or nest) the mod id? Used before installing a missing dependency. */
async function jarProvides(filePath, modId) {
  const zip = await openZipFile(filePath);
  try {
    const info = await readJarInfo(zip);
    return { ok: info.providedIds.has(modId), ids: [...info.providedIds], kinds: [...info.kinds] };
  } finally {
    await zip.close().catch(() => {});
  }
}

module.exports = {
  detectCrash,
  diagnoseInstance,
  disableShaders,
  jarProvides,
  // exported for tests
  _internal: { openZipFile, readJarInfo, parseModsToml, matchesFabricRange, matchesMavenRange, redact },
};
