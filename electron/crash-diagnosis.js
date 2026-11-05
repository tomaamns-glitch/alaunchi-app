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

/** Did the session that started at `startedAt` end in a crash? */
async function detectCrash({ instanceDir, startedAt }) {
  const since = (startedAt || 0) - 2000;
  const report = await newestFile(path.join(instanceDir, "crash-reports"), /^crash-.*\.txt$/i, since);
  if (report) {
    const text = await readTail(report.path, 64 * 1024);
    const description = /^Description:\s*(.+)$/m.exec(text)?.[1]?.trim() || null;
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
  const report = await newestFile(path.join(instanceDir, "crash-reports"), /^crash-.*\.txt$/i, 0);
  const jvm = await newestFile(instanceDir, /^hs_err_pid\d+\.log$/i, 0);
  const reportText = report ? await readTail(report.path, 256 * 1024) : "";
  // hs_err files put what matters (reason, problematic frame, command line) at the top.
  const jvmText = jvm ? await readHead(jvm.path, 128 * 1024) : "";
  const launchLog = await readTail(path.join(instanceDir, "launch.log"), 1024 * 1024);
  const latestLog = await readTail(path.join(instanceDir, "logs", "latest.log"), 1024 * 1024);
  const logs = `${launchLog}\n${latestLog}`;
  const allText = `${reportText}\n${jvmText}\n${logs}`;
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
    let zip = null;
    try {
      zip = await openZipFile(file);
      mods.push({ file, rel, info: await readJarInfo(zip), mtimeMs: st?.mtimeMs || 0 });
    } catch (e) {
      mods.push({ file, rel, info: null, mtimeMs: st?.mtimeMs || 0, damaged: e.message });
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
          detail: `Instala "${dep.id}" desde la pestaña Mods${dep.range && dep.range !== "*" ? ` (versión ${Array.isArray(dep.range) ? dep.range.join(" o ") : dep.range})` : ""} o desactiva ${mi.name}.`,
          fix: disableFix([m], `Desactivar ${mi.name}`),
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
      fix: self ? disableFix([self], `Desactivar ${name}`) : null,
      searchQuery: missing ? depId : undefined,
    });
  }

  // Forge/NeoForge missing dependencies.
  for (const fm of logs.matchAll(/Mod ID: '([^']+)', Requested by: '([^']+)', Expected range: '([^']*)', Actual version: '([^']*)'/g)) {
    const [, depId, by, range, actual] = fm;
    const self = modForId(by);
    const missing = /MISSING/i.test(actual);
    add({
      key: missing ? `missing:${by}:${depId}` : `forgever:${by}:${depId}`,
      severity: "critical",
      category: "mods",
      title: missing
        ? `${self ? nameOf(self) : by} necesita ${depId}, que no está instalado`
        : `${self ? nameOf(self) : by} necesita otra versión de ${depId}`,
      detail: `Pide ${depId} ${range}${missing ? "" : ` y tienes la ${actual}`}.`,
      fix: self ? disableFix([self], `Desactivar ${nameOf(self)}`) : null,
      searchQuery: missing ? depId : undefined,
    });
  }

  // Broken loader install / damaged game files reported by the JVM.
  if (/Mod ID 'minecraft'.{0,40}MISSING|NoClassDefFoundError: net\/minecraft\/|ClassNotFoundException: net\.minecraft\.|Could not find or load main class/i.test(allText)) {
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
    const ranked = [...scores.entries()].filter(([, s]) => s.score >= 3).sort((a, b) => b[1].score - a[1].score).slice(0, 2);
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

  return {
    findings,
    lastCrashAt,
    crashReport: report ? path.basename(report.path) : null,
    description: /^Description:\s*(.+)$/m.exec(reportText)?.[1]?.trim() || null,
    excerpt: redact(excerpt).slice(0, 8000),
    modsScanned: mods.length,
  };
}

module.exports = {
  detectCrash,
  diagnoseInstance,
  // exported for tests
  _internal: { openZipFile, readJarInfo, parseModsToml, matchesFabricRange, matchesMavenRange, redact },
};
