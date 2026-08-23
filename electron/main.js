const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs/promises");
const fsSync = require("fs");
const https = require("https");
const http = require("http");
const { spawn, exec } = require("child_process");
const { promisify } = require("util");
const crypto = require("crypto");
const os = require("os");
const dns = require("dns");
const AdmZip = require("adm-zip");

const execAsync = promisify(exec);

// Prefer IPv4 for all outbound requests. On networks where IPv6 is advertised but
// not actually routed (common with some ISP routers), Node's default resolution
// order can hand https.request an IPv6 address that hangs until it times out
// before ever trying IPv4 — every download/API call in this file inherits this.
dns.setDefaultResultOrder("ipv4first");

const isDev = process.env.NODE_ENV === "development";

// Safety net: an uncaught error in the main process would otherwise show Electron's
// default "A JavaScript error occurred in the main process" dialog and can leave
// the app in a broken state. Log it instead — individual operations (downloads,
// IPC handlers) already reject their own promises, so the caller in the renderer
// gets a proper error toast rather than the whole app appearing to crash.
//
// Also forward it to the renderer so it can be reported (renderer holds the GitHub
// token; main process never sees it — same reasoning as the texture/skin proxy).
function forwardErrorToRenderer(context, err) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("app:error", {
    context,
    message: err?.message || String(err),
    stack: err?.stack || null,
  });
}

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  forwardErrorToRenderer("main:uncaughtException", err);
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("[unhandledRejection]", err);
  forwardErrorToRenderer("main:unhandledRejection", err);
});

// ─── CONFIGURACIÓN DEL LAUNCHER ────────────────────────────────────────────
// Cambia azureClientId por el tuyo antes de distribuir la app.
// Los usuarios finales no necesitan configurar nada.
const LAUNCHER_CONFIG = {
  azureClientId: "544a65b8-0d01-4dad-bb15-67202be45edc",
};
// ────────────────────────────────────────────────────────────────────────────

// Root data folder is normally ~/.alaunchi, but can be overridden by the user
// (Ajustes → Ubicación de datos). The override pointer lives in Electron's stable
// per-app userData dir so it can be read before APP_DATA_DIR itself is known.
const LOCATION_FILE = path.join(app.getPath("userData"), "location.json");

function getOverriddenDataDir() {
  try {
    const raw = fsSync.readFileSync(LOCATION_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.dataDir && typeof parsed.dataDir === "string") return parsed.dataDir;
  } catch {}
  return null;
}

const APP_DATA_DIR = getOverriddenDataDir() || path.join(os.homedir(), ".alaunchi");
const INSTANCES_DIR = path.join(APP_DATA_DIR, "instances");
const CACHE_DIR = path.join(APP_DATA_DIR, "cache");
const JAVA_DIR = path.join(APP_DATA_DIR, "java");
const OBJECTS_DIR = path.join(APP_DATA_DIR, "objects");
const SKIN_LIBRARY_DIR = path.join(APP_DATA_DIR, "skin-library");
const SKIN_LIBRARY_INDEX = path.join(SKIN_LIBRARY_DIR, "index.json");

async function ensureDirs() {
  await fs.mkdir(APP_DATA_DIR, { recursive: true });
  await fs.mkdir(INSTANCES_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(JAVA_DIR, { recursive: true });
  await fs.mkdir(OBJECTS_DIR, { recursive: true });
  await fs.mkdir(SKIN_LIBRARY_DIR, { recursive: true });
}

const HASH_RE = /^[a-f0-9]{64}$/;
function assertValidHash(hash) {
  if (typeof hash !== "string" || !HASH_RE.test(hash)) {
    throw new Error(`Hash inválido (se esperaba 64 hex en minúsculas): ${String(hash).slice(0, 80)}`);
  }
}

function validateUUID(str) {
  if (typeof str !== "string" || !str) return null;
  const clean = str.replace(/-/g, "");
  if (clean.length === 32 && /^[0-9a-fA-F]+$/.test(clean)) {
    return `${clean.slice(0,8)}-${clean.slice(8,12)}-${clean.slice(12,16)}-${clean.slice(16,20)}-${clean.slice(20)}`;
  }
  return null;
}

function objectCachePath(hash) {
  assertValidHash(hash);
  return path.join(OBJECTS_DIR, hash.substring(0, 2), hash);
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const s = fsSync.createReadStream(filePath);
    s.on("data", (c) => h.update(c));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

function hashFileSha1(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha1");
    const s = fsSync.createReadStream(filePath);
    s.on("data", (c) => h.update(c));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

// Per-hash in-flight dedup so concurrent workers wanting the same hash share one download.
const inFlightObjects = new Map();

async function ensureObject(hash, downloadUrl, headers) {
  const cachePath = objectCachePath(hash);
  if (fsSync.existsSync(cachePath)) {
    const actual = await hashFile(cachePath);
    if (actual === hash) return cachePath;
    await fs.unlink(cachePath).catch(() => {});
  }
  const inFlight = inFlightObjects.get(hash);
  if (inFlight) return inFlight;

  const p = (async () => {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    // Write to a temp path outside the objects tree so Windows Defender doesn't lock
    // the parent directory while scanning a large partial download.
    const tmpName = `${hash.slice(0, 16)}.tmp.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
    const tmpPath = path.join(os.tmpdir(), tmpName);
    try {
      await downloadFile(downloadUrl, tmpPath, null, headers);
      const actual = await hashFile(tmpPath);
      if (actual !== hash) {
        throw new Error(`Hash mismatch para ${hash.slice(0, 12)} (got ${actual.slice(0, 12)})`);
      }
      // Windows may hold the file briefly after close; retry rename with a short delay.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await fs.rename(tmpPath, cachePath);
          break;
        } catch (e) {
          const raceOk = fsSync.existsSync(cachePath) && (await hashFile(cachePath)) === hash;
          if (raceOk) {
            await fs.unlink(tmpPath).catch(() => {});
            break;
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
          else throw e;
        }
      }
      return cachePath;
    } catch (e) {
      await fs.unlink(tmpPath).catch(() => {});
      throw e;
    }
  })();

  inFlightObjects.set(hash, p);
  try {
    return await p;
  } finally {
    inFlightObjects.delete(hash);
  }
}

async function placeObject(hash, destPath) {
  const cachePath = objectCachePath(hash);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  try { await fs.unlink(destPath); } catch {}
  try {
    await fs.link(cachePath, destPath);
  } catch {
    await fs.copyFile(cachePath, destPath);
  }
}

function safeJoin(base, rel) {
  const target = path.resolve(base, rel);
  const baseRes = path.resolve(base);
  if (target !== baseRes && !target.startsWith(baseRes + path.sep)) {
    throw new Error(`Ruta insegura: ${rel}`);
  }
  return target;
}

let mainWindow = null;

function setupAutoUpdater(win) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  const send = (channel, data) => {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  };

  autoUpdater.on("checking-for-update", () => send("update-status", { state: "checking" }));
  autoUpdater.on("update-available", (info) =>
    send("update-status", { state: "available", version: info.version })
  );
  autoUpdater.on("update-not-available", () => send("update-status", { state: "not-available" }));
  autoUpdater.on("download-progress", (progress) =>
    send("update-status", { state: "downloading", percent: progress.percent })
  );
  autoUpdater.on("update-downloaded", (info) =>
    send("update-status", { state: "downloaded", version: info.version })
  );
  autoUpdater.on("error", (err) =>
    send("update-status", { state: "error", message: err?.message || String(err) })
  );

  ipcMain.handle("update:check", () => {
    if (isDev) return { skipped: true };
    return autoUpdater.checkForUpdates();
  });
  ipcMain.handle("update:download", () => autoUpdater.downloadUpdate());
  ipcMain.handle("update:install", () => autoUpdater.quitAndInstall());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 900,
    minHeight: 580,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0d0d0d",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev,
      sandbox: false,
    },
    icon: path.join(__dirname, "../public/logo.png"),
    show: false,
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  // Links inside rendered mod descriptions (Discord/GitHub/etc.) must open in the
  // user's real browser, not navigate the launcher's own window away from the app.
  const isAppUrl = (url) => (isDev ? url.startsWith("http://localhost:5173") : url.startsWith("file://"));
  win.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  ipcMain.on("window-minimize", () => win.minimize());
  ipcMain.on("window-maximize", () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("window-close", () => win.close());
  ipcMain.handle("window:is-maximized", () => win.isMaximized());
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.on("app:focus-window", () => {
    if (win.isDestroyed()) return;
    win.show();
    win.focus();
  });

  const sendMaximizedState = () => {
    if (!win.isDestroyed()) win.webContents.send("window-maximized-change", win.isMaximized());
  };
  win.on("maximize", sendMaximizedState);
  win.on("unmaximize", sendMaximizedState);

  // Closing the window (the custom titlebar's X, or Alt+F4) hides it instead of
  // quitting — the game keeps running detached either way, but quitting also
  // kills the playtime watcher and the presence websocket, so a session played
  // with the launcher closed would go untracked. Only an explicit quit (tray
  // menu, or the auto-updater's quitAndInstall) actually exits.
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
    if (!hasShownTrayHint) {
      hasShownTrayHint = true;
      tray?.displayBalloon({
        title: "ALaunchi sigue abierto",
        content: "Sigue en segundo plano para contar bien las horas jugadas. Para cerrarlo del todo, clic derecho en este icono.",
      });
    }
  });

  return win;
}

let isQuitting = false;
let hasShownTrayHint = false;
let tray = null;

app.on("before-quit", () => {
  isQuitting = true;
});

function createTray(win) {
  const icon = nativeImage.createFromPath(path.join(__dirname, "../public/logo.png")).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip("ALaunchi");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir ALaunchi", click: () => { win.show(); win.focus(); } },
      { type: "separator" },
      { label: "Cerrar", click: () => app.quit() },
    ])
  );
  tray.on("click", () => {
    if (win.isVisible()) win.hide();
    else { win.show(); win.focus(); }
  });
}

app.whenReady().then(async () => {
  await ensureDirs();
  mainWindow = createWindow();
  setupAutoUpdater(mainWindow);
  createTray(mainWindow);
  reconcileDanglingPlaytimeSessions();
  if (!isDev) {
    autoUpdater.checkForUpdates().catch((err) => console.error("Auto-update check failed:", err));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function downloadFile(url, destPath, onProgress, headers) {
  return new Promise((resolve, reject) => {
    const file = fsSync.createWriteStream(destPath);
    const protocol = url.startsWith("https") ? https : http;

    // Attach this immediately: the stream can emit "error" (e.g. EPERM from an
    // antivirus briefly locking the temp file) before the HTTP response arrives
    // and handleResponse() attaches its own listener below. An EventEmitter that
    // errors with no listener throws, which crashes the whole main process.
    let settled = false;
    file.on("error", (err) => {
      if (settled) return;
      settled = true;
      file.close(() => {
        fsSync.unlink(destPath, () => {});
        reject(err);
      });
    });

    const handleResponse = (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(() => {
          fsSync.unlink(destPath, () => {});
          // Don't forward custom headers (esp. Authorization) to the redirect target —
          // presigned storage URLs reject requests carrying an unexpected Authorization header.
          downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject);
        });
        return;
      }
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        res.resume();
        file.close(() => {
          fsSync.unlink(destPath, () => {});
          reject(new Error(`HTTP ${res.statusCode} descargando ${url.split("?")[0]}`));
        });
        return;
      }
      const total = parseInt(res.headers["content-length"] || "0", 10);
      let downloaded = 0;
      res.on("data", (chunk) => {
        downloaded += chunk.length;
        if (onProgress && total > 0) onProgress(Math.round((downloaded / total) * 100));
      });
      res.pipe(file);
      file.on("finish", () => {
        settled = true;
        file.close(() => resolve());
      });
      // Errors from here on are also caught by the early "error" listener above.
    };

    const request = headers
      ? protocol.get(url, { headers }, handleResponse)
      : protocol.get(url, handleResponse);
    request.on("error", (err) => {
      if (settled) return;
      settled = true;
      file.close(() => {
        fsSync.unlink(destPath, () => {});
        reject(err);
      });
    });
  });
}

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, { headers: { "User-Agent": "ALaunchi/1.0", ...headers } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          return reject(new Error(`HTTP ${res.statusCode} en ${url}: ${data.slice(0, 300)}`));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON from " + url)); }
      });
    }).on("error", reject);
  });
}

// General authenticated request (PUT/POST/DELETE) with an optional JSON body.
// Used for the Mojang profile-mutation endpoints (skin/cape), which fetchJson's
// GET-only shape can't cover. Resolves with the parsed JSON body regardless of
// status code — callers check statusCode themselves since Mojang's error
// payloads (e.g. "cape not owned") are useful to show the user, not just log.
function httpRequestJson(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    const protocol = url.startsWith("https") ? https : http;
    const req = protocol.request(
      url,
      {
        method,
        headers: {
          "User-Agent": "ALaunchi/1.0",
          ...(bodyStr ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch {}
          resolve({ statusCode: res.statusCode ?? 0, body: parsed, raw: data });
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Uploads a PNG (as a multipart/form-data field named "file") plus a couple of
// plain text fields, hand-rolled since Node's http module has no multipart
// helper of its own. Used for the Mojang skin-upload endpoint.
function uploadMultipart(url, { headers = {}, fields = {}, fileFieldName, fileBuffer, fileName }) {
  return new Promise((resolve, reject) => {
    const boundary = `----ALaunchiBoundary${crypto.randomBytes(16).toString("hex")}`;
    const parts = [];
    for (const [name, value] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    }
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`
    ));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const bodyBuf = Buffer.concat(parts);

    const protocol = url.startsWith("https") ? https : http;
    const req = protocol.request(
      url,
      {
        method: "POST",
        headers: {
          "User-Agent": "ALaunchi/1.0",
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": bodyBuf.length,
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch {}
          resolve({ statusCode: res.statusCode ?? 0, body: parsed, raw: data });
        });
      }
    );
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

// ─── PLAYTIME TRACKING ──────────────────────────────────────────────────────
// Minecraft is spawned detached and unref'd (see mc:launch) so closing the
// launcher never kills the game — which means we can't rely on a child.on("exit")
// event, since that only fires while this process is still alive to hear it.
// Instead we poll the pid and persist an in-progress session to disk, so a
// session survives the launcher being closed and reopened while the game is
// still running (reconciled at startup below).
const activePlaytimeWatchers = new Map(); // modpackId -> intervalId

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function creditPlaytimeAndClearSession(modpackId, startedAt) {
  const metaPath = path.join(INSTANCES_DIR, modpackId, "alaunchi-meta.json");
  try {
    const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    meta.totalPlaytimeMs = (meta.totalPlaytimeMs || 0) + Math.max(0, Date.now() - startedAt);
    delete meta.activeSession;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  } catch (e) {
    console.warn(`[Playtime] No se pudo actualizar el tiempo jugado de ${modpackId}:`, e.message);
  }
  // Main process has no Firebase/GitHub credentials (renderer-only, by design) —
  // just tell the renderer which modpack's session ended so it can mark itself
  // offline in the presence database.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("playtime:session-ended", { modpackId });
  }
}

function watchProcessForPlaytime(modpackId, pid, startedAt) {
  const existing = activePlaytimeWatchers.get(modpackId);
  if (existing) clearInterval(existing);
  const interval = setInterval(() => {
    if (isPidAlive(pid)) return;
    clearInterval(interval);
    activePlaytimeWatchers.delete(modpackId);
    creditPlaytimeAndClearSession(modpackId, startedAt);
  }, 30_000);
  activePlaytimeWatchers.set(modpackId, interval);
}

// On startup, pick back up any session left running by a previous launcher
// process (closed or crashed mid-game) — resume watching it if the game is
// still alive, or drop the stale marker if it isn't (its real end time is
// unknowable at this point, so we don't guess — that session's tail just
// goes uncounted rather than risking an inflated total).
async function reconcileDanglingPlaytimeSessions() {
  try {
    const entries = await fs.readdir(INSTANCES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(INSTANCES_DIR, entry.name, "alaunchi-meta.json");
      if (!fsSync.existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
        if (!meta.activeSession) continue;
        const { pid, startedAt } = meta.activeSession;
        if (isPidAlive(pid)) {
          watchProcessForPlaytime(entry.name, pid, startedAt);
        } else {
          delete meta.activeSession;
          await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
        }
      } catch {}
    }
  } catch {}
}

ipcMain.handle("mc:get-installed-modpacks", async () => {
  try {
    const entries = await fs.readdir(INSTANCES_DIR, { withFileTypes: true });
    const installed = {};
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metaPath = path.join(INSTANCES_DIR, entry.name, "alaunchi-meta.json");
        if (fsSync.existsSync(metaPath)) {
          const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
          installed[entry.name] = meta;
        }
      }
    }
    return installed;
  } catch {
    return {};
  }
});

async function extractBundleZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryPath = path.join(destDir, entry.entryName);
    await fs.mkdir(path.dirname(entryPath), { recursive: true });
    await fs.writeFile(entryPath, entry.getData());
  }
}

function resolveFileDestPath(file, instanceDir) {
  if (file.path) return path.join(instanceDir, file.path);
  const isZip = file.filename?.toLowerCase().endsWith(".zip");
  const isBundle = file.type === "bundle" || (isZip && file.type === "mod");
  if (isBundle) return null;
  if (file.type === "mod") return path.join(instanceDir, "mods", file.filename);
  if (file.type === "resourcepack") return path.join(instanceDir, "resourcepacks", file.filename);
  if (file.type === "shader") return path.join(instanceDir, "shaderpacks", file.filename);
  return path.join(instanceDir, file.filename);
}

async function fileNeedsDownload(destPath, sizeMb) {
  if (!destPath) return true;
  try {
    const stat = await fs.stat(destPath);
    const existingSizeMb = parseFloat((stat.size / 1_048_576).toFixed(2));
    return existingSizeMb !== sizeMb;
  } catch {
    return true;
  }
}

ipcMain.handle("mc:install-modpack", async (event, { modpackId, modpack, files }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const instanceDir = path.join(INSTANCES_DIR, modpackId);
  const modsDir = path.join(instanceDir, "mods");
  const resourcepacksDir = path.join(instanceDir, "resourcepacks");
  const shaderpacks = path.join(instanceDir, "shaderpacks");

  const hasBundle = (files || []).some((f) => {
    const isZip = f.filename?.toLowerCase().endsWith(".zip");
    return f.type === "bundle" || (isZip && f.type === "mod");
  });
  const instanceExists = fsSync.existsSync(instanceDir);

  if (hasBundle && instanceExists) {
    const metaPath = path.join(instanceDir, "alaunchi-meta.json");
    let metaContent = null;
    try { metaContent = await fs.readFile(metaPath, "utf8"); } catch {}
    await fs.rm(instanceDir, { recursive: true, force: true });
    await fs.mkdir(instanceDir, { recursive: true });
    if (metaContent) await fs.writeFile(metaPath, metaContent);
  } else {
    await fs.mkdir(instanceDir, { recursive: true });
  }

  await fs.mkdir(modsDir, { recursive: true });
  await fs.mkdir(resourcepacksDir, { recursive: true });
  await fs.mkdir(shaderpacks, { recursive: true });

  win?.webContents.send("install-progress", { modpackId, stage: "downloading", progress: 0 });

  for (let i = 0; i < (files || []).length; i++) {
    const file = files[i];
    if (!file.downloadUrl) continue;
    const destPath = resolveFileDestPath(file, instanceDir);
    const needsDownload = await fileNeedsDownload(destPath, file.sizeMb);
    if (!needsDownload) {
      const overall = Math.round(((i + 1) / files.length) * 100);
      win?.webContents.send("install-progress", { modpackId, stage: "downloading", progress: overall });
      continue;
    }
    if (destPath === null) {
      const tmpZip = path.join(CACHE_DIR, `bundle-${modpackId}-${Date.now()}.zip`);
      await downloadFile(file.downloadUrl, tmpZip, (p) => {
        const overall = Math.round(((i + p / 100) / files.length) * 100);
        win?.webContents.send("install-progress", { modpackId, stage: "downloading", progress: overall });
      });
      await extractBundleZip(tmpZip, instanceDir);
      await fs.unlink(tmpZip).catch(() => {});
    } else {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await downloadFile(file.downloadUrl, destPath, (p) => {
        const overall = Math.round(((i + p / 100) / files.length) * 100);
        win?.webContents.send("install-progress", { modpackId, stage: "downloading", progress: overall });
      });
    }
  }

  const meta = {
    id: modpackId,
    name: modpack?.name ?? modpackId,
    version: modpack?.version ?? "1.0.0",
    minecraftVersion: modpack?.minecraftVersion ?? "1.20.4",
    loaderType: modpack?.loaderType ?? "vanilla",
    installedAt: new Date().toISOString(),
    installedManifest: files || [],
  };
  await fs.writeFile(path.join(instanceDir, "alaunchi-meta.json"), JSON.stringify(meta, null, 2));

  win?.webContents.send("install-progress", { modpackId, stage: "done", progress: 100 });
  return { success: true };
});

ipcMain.handle("mc:update-modpack", async (event, { modpackId, filesToDelete, filesToAdd }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const instanceDir = path.join(INSTANCES_DIR, modpackId);

  win?.webContents.send("install-progress", { modpackId, stage: "updating", progress: 0 });

  const deletingBundle = (filesToDelete || []).some((f) => f.toLowerCase().endsWith(".zip"));
  const addingBundle = (filesToAdd || []).some((f) => {
    const isZip = f.filename?.toLowerCase().endsWith(".zip");
    return f.type === "bundle" || (isZip && f.type === "mod");
  });

  if (deletingBundle && addingBundle) {
    const metaPath = path.join(instanceDir, "alaunchi-meta.json");
    let metaContent = null;
    try { metaContent = await fs.readFile(metaPath, "utf8"); } catch {}
    await fs.rm(instanceDir, { recursive: true, force: true });
    await fs.mkdir(instanceDir, { recursive: true });
    if (metaContent) await fs.writeFile(metaPath, metaContent);
  } else {
    for (const filename of (filesToDelete || [])) {
      const possiblePaths = [
        path.join(instanceDir, "mods", filename),
        path.join(instanceDir, "resourcepacks", filename),
        path.join(instanceDir, "shaderpacks", filename),
        path.join(instanceDir, filename),
      ];
      for (const p of possiblePaths) {
        if (fsSync.existsSync(p)) { await fs.unlink(p); break; }
      }
    }
  }

  win?.webContents.send("install-progress", { modpackId, stage: "updating", progress: 50 });

  for (let i = 0; i < (filesToAdd || []).length; i++) {
    const file = filesToAdd[i];
    if (!file.downloadUrl) continue;
    const isZipFile = file.filename?.toLowerCase().endsWith(".zip");
    const isBundleFile = file.type === "bundle" || (isZipFile && file.type === "mod");
    if (isBundleFile) {
      const tmpZip = path.join(CACHE_DIR, `bundle-${modpackId}-${Date.now()}.zip`);
      await downloadFile(file.downloadUrl, tmpZip, () => {});
      await extractBundleZip(tmpZip, instanceDir);
      await fs.unlink(tmpZip).catch(() => {});
    } else {
      let destDir = instanceDir;
      if (file.type === "mod") destDir = path.join(instanceDir, "mods");
      else if (file.type === "resourcepack") destDir = path.join(instanceDir, "resourcepacks");
      else if (file.type === "shader") destDir = path.join(instanceDir, "shaderpacks");
      const destPath = path.join(destDir, file.filename);
      await downloadFile(file.downloadUrl, destPath, () => {});
    }
  }

  win?.webContents.send("install-progress", { modpackId, stage: "done", progress: 100 });
  return { success: true };
});

ipcMain.handle("mc:sync-modpack", async (event, { modpackId, modpack, newFiles }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const instanceDir = path.join(INSTANCES_DIR, modpackId);

  win?.webContents.send("install-progress", { modpackId, stage: "downloading", progress: 0 });

  let oldFiles = [];
  try {
    const metaRaw = await fs.readFile(path.join(instanceDir, "alaunchi-meta.json"), "utf8");
    oldFiles = JSON.parse(metaRaw).installedManifest || [];
  } catch {}

  const fileKey = (f) => f.path ?? f.filename;
  const oldMap = new Map(oldFiles.map((f) => [fileKey(f), f]));
  const newMap = new Map((newFiles || []).map((f) => [fileKey(f), f]));

  for (const [key, oldFile] of oldMap) {
    if (!newMap.has(key)) {
      const destPath = resolveFileDestPath(oldFile, instanceDir);
      if (destPath) {
        await fs.unlink(destPath).catch(() => {});
      }
    }
  }

  const toDownload = (newFiles || []).filter((f) => {
    const old = oldMap.get(fileKey(f));
    if (!old) return true;
    return old.sizeMb !== f.sizeMb;
  });

  await fs.mkdir(path.join(instanceDir, "mods"), { recursive: true });
  await fs.mkdir(path.join(instanceDir, "resourcepacks"), { recursive: true });
  await fs.mkdir(path.join(instanceDir, "shaderpacks"), { recursive: true });

  for (let i = 0; i < toDownload.length; i++) {
    const file = toDownload[i];
    if (!file.downloadUrl) continue;
    const destPath = resolveFileDestPath(file, instanceDir);
    if (destPath === null) {
      const tmpZip = path.join(CACHE_DIR, `bundle-${modpackId}-${Date.now()}.zip`);
      await downloadFile(file.downloadUrl, tmpZip, (p) => {
        const overall = Math.round(((i + p / 100) / toDownload.length) * 100);
        win?.webContents.send("install-progress", { modpackId, stage: "downloading", progress: overall });
      });
      await extractBundleZip(tmpZip, instanceDir);
      await fs.unlink(tmpZip).catch(() => {});
    } else {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await downloadFile(file.downloadUrl, destPath, (p) => {
        const overall = Math.round(((i + p / 100) / toDownload.length) * 100);
        win?.webContents.send("install-progress", { modpackId, stage: "downloading", progress: overall });
      });
    }
  }

  try {
    const metaRaw = await fs.readFile(path.join(instanceDir, "alaunchi-meta.json"), "utf8");
    const meta = JSON.parse(metaRaw);
    meta.version = modpack?.version ?? meta.version;
    meta.installedManifest = newFiles || [];
    meta.installedAt = new Date().toISOString();
    await fs.writeFile(path.join(instanceDir, "alaunchi-meta.json"), JSON.stringify(meta, null, 2));
  } catch {}

  win?.webContents.send("install-progress", { modpackId, stage: "done", progress: 100 });
  return { success: true, downloaded: toDownload.length };
});

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") throw new Error("Manifiesto inválido");
  if (manifest.schemaVersion !== 2) throw new Error("Versión de manifiesto no soportada");
  if (typeof manifest.objectsTag !== "string" || !manifest.objectsTag) throw new Error("Manifiesto sin objectsTag");
  if (!Array.isArray(manifest.files)) throw new Error("Manifiesto sin files[]");
  const seen = new Set();
  for (const f of manifest.files) {
    if (!f || typeof f !== "object") throw new Error("Entrada de manifiesto inválida");
    if (typeof f.path !== "string" || !f.path) throw new Error("Entrada sin path");
    if (f.path.includes("\\")) throw new Error(`path con backslash no permitido: ${f.path}`);
    if (f.path.startsWith("/")) throw new Error(`path absoluto no permitido: ${f.path}`);
    if (f.path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) {
      throw new Error(`path inseguro: ${f.path}`);
    }
    if (f.path.includes("\0")) throw new Error(`path con null byte: ${f.path}`);
    if (typeof f.hash !== "string" || !HASH_RE.test(f.hash)) throw new Error(`hash inválido en ${f.path}`);
    if (typeof f.size !== "number" || !Number.isFinite(f.size) || f.size < 0) throw new Error(`size inválido en ${f.path}`);
    if (seen.has(f.path)) throw new Error(`path duplicado: ${f.path}`);
    seen.add(f.path);
  }
}

ipcMain.handle("mc:install-snapshot", async (event, { modpackId, modpack, manifest, baseUrl, token }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  validateManifest(manifest);
  if (typeof baseUrl !== "string" || !baseUrl.startsWith("https://")) {
    throw new Error("Falta URL base de objetos (https)");
  }

  // For private repos, the plain releases/download URL (baseUrl + hash) 404s without an
  // authenticated browser session. If we have a token, resolve the release's asset IDs up
  // front so downloadWorker can fetch each object through the authenticated API endpoint
  // instead (GET /releases/assets/{id} with Accept: application/octet-stream).
  let assetByHash = null;
  const repoMatch = baseUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/$/);
  if (token && repoMatch) {
    const [, owner, repo, tag] = repoMatch;
    try {
      const release = await fetchJson(
        `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
        { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
      );
      assetByHash = new Map();
      for (const a of release.assets || []) {
        assetByHash.set(a.name, `https://api.github.com/repos/${owner}/${repo}/releases/assets/${a.id}`);
      }
    } catch (e) {
      console.error("[install-snapshot] No se pudo listar assets con token:", e.message);
    }
  }

  const instanceDir = path.join(INSTANCES_DIR, modpackId);
  await fs.mkdir(instanceDir, { recursive: true });

  const metaPath = path.join(instanceDir, "alaunchi-meta.json");
  let oldFiles = [];
  let removedOptionalPaths = new Set();
  try {
    const oldMeta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    if (oldMeta.snapshot?.files) oldFiles = oldMeta.snapshot.files;
    if (Array.isArray(oldMeta.removedOptionalPaths)) removedOptionalPaths = new Set(oldMeta.removedOptionalPaths);
  } catch {}

  const oldByPath = new Map(oldFiles.filter((f) => f && typeof f.path === "string").map((f) => [f.path, f]));
  const newByPath = new Map(manifest.files.map((f) => [f.path, f]));

  const total = manifest.files.length;
  let done = 0;
  const sendProgress = (stage) => {
    win?.webContents.send("install-progress", {
      modpackId,
      stage: stage || "downloading",
      progress: total === 0 ? 100 : Math.round((done / total) * 100),
      done,
      total,
    });
  };
  sendProgress();

  // Pre-resolve dest paths; skip entries that are already on-disk with correct hash.
  // Empty files (size 0) are split out: they aren't published to GitHub, we just touch them.
  const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const pending = []; // [{ entry, destPath }]
  const emptyFiles = []; // [{ entry, destPath }]
  for (const f of manifest.files) {
    const destPath = safeJoin(instanceDir, f.path);
    try {
      const stat = await fs.stat(destPath);
      if (stat.size === f.size && (f.size === 0 || (await hashFile(destPath)) === f.hash)) {
        done++;
        sendProgress();
        continue;
      }
    } catch {}
    // The user deliberately deleted this optional file — don't restore it, unless
    // the admin has since made it mandatory again in this manifest.
    if (f.required === false && removedOptionalPaths.has(f.path)) {
      done++;
      sendProgress();
      continue;
    }
    if (f.size === 0 || f.hash === EMPTY_HASH) {
      emptyFiles.push({ entry: f, destPath });
    } else {
      pending.push({ entry: f, destPath });
    }
  }

  // Phase 1: ensure all needed objects exist in the global cache (no instance writes yet).
  // Progress is advanced by the number of pending files that depend on each downloaded hash,
  // so the UI moves smoothly from 0 → 100 across both phases.
  const filesByHash = new Map();
  const pathsByHash = new Map();
  for (const p of pending) {
    if (!filesByHash.has(p.entry.hash)) {
      filesByHash.set(p.entry.hash, 0);
      pathsByHash.set(p.entry.hash, []);
    }
    filesByHash.set(p.entry.hash, filesByHash.get(p.entry.hash) + 1);
    pathsByHash.get(p.entry.hash).push(p.entry.path);
  }
  const uniqueHashes = Array.from(filesByHash.keys());

  // Reserve half the remaining work for the download phase, half for the place phase.
  // We advance "virtual done" by 0.5 per file in phase 1, then 0.5 per file in phase 2.
  let virtualDone = done * 2; // scale to half-units
  const virtualTotal = total * 2;
  const sendVirtual = () => {
    win?.webContents.send("install-progress", {
      modpackId,
      stage: "downloading",
      progress: virtualTotal === 0 ? 100 : Math.round((virtualDone / virtualTotal) * 100),
      done: Math.floor(virtualDone / 2),
      total,
    });
  };
  sendVirtual();

  // Failures don't abort the batch — a single missing object (typically one that
  // never actually got uploaded during a prior publish) used to kill the whole
  // install after downloading just one or two hashes' worth, hiding how many
  // objects were actually missing. Instead, collect every failure and keep going,
  // so a single pass reports the complete picture instead of one hash at a time.
  let hashIdx = 0;
  const CONCURRENCY = 6;
  const failedHashes = []; // [{ hash, error }]
  async function downloadWorker() {
    while (true) {
      const i = hashIdx++;
      if (i >= uniqueHashes.length) return;
      const hash = uniqueHashes[i];
      try {
        const assetUrl = assetByHash?.get(hash);
        if (assetUrl) {
          await ensureObject(hash, assetUrl, {
            Authorization: `Bearer ${token}`,
            Accept: "application/octet-stream",
            "User-Agent": "ALaunchi/1.0",
          });
        } else {
          await ensureObject(hash, baseUrl + hash);
        }
      } catch (e) {
        failedHashes.push({ hash, error: e.message });
        continue;
      }
      virtualDone += filesByHash.get(hash);
      sendVirtual();
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => downloadWorker()));

  const failedHashSet = new Set(failedHashes.map((f) => f.hash));

  // Phase 2: place files from cache into instance dir (skip anything that failed above).
  for (const { entry, destPath } of pending) {
    if (failedHashSet.has(entry.hash)) continue;
    await placeObject(entry.hash, destPath);
    done++;
    virtualDone += 1;
    sendVirtual();
  }

  if (failedHashes.length > 0) {
    const lines = failedHashes.slice(0, 15).map(({ hash, error }) => {
      const paths = pathsByHash.get(hash) || [];
      const pathList = paths.slice(0, 3).join(", ") + (paths.length > 3 ? ` (+${paths.length - 3} más)` : "");
      return `  ${hash.slice(0, 12)}… → ${pathList}: ${error}`;
    });
    throw new Error(
      `${failedHashes.length} objeto(s) del manifiesto no se pudieron descargar — probablemente nunca se subieron al publicar. ` +
        `Vuelve a lanzar la publicación de este modpack para rellenar los que faltan.\n${lines.join("\n")}` +
        (failedHashes.length > 15 ? `\n  ...y ${failedHashes.length - 15} más` : "")
    );
  }

  // Phase 2b: materialize empty files locally (never downloaded — GitHub rejects 0-byte assets).
  for (const { destPath } of emptyFiles) {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    const fh = await fs.open(destPath, "w");
    await fh.close();
    done++;
    virtualDone += 2;
    sendVirtual();
  }

  // Phase 3: delete files that were in old manifest but not in new (only after a successful install).
  for (const [p] of oldByPath) {
    if (!newByPath.has(p)) {
      try {
        const fullPath = safeJoin(instanceDir, p);
        await fs.unlink(fullPath).catch(() => {});
      } catch {}
    }
  }

  const meta = {
    id: modpackId,
    name: modpack?.name ?? modpackId,
    version: manifest.version,
    minecraftVersion: modpack?.minecraftVersion,
    loaderType: modpack?.loaderType,
    installedAt: new Date().toISOString(),
    snapshot: manifest,
    removedOptionalPaths: Array.from(removedOptionalPaths).filter((p) => newByPath.has(p)),
  };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

  win?.webContents.send("install-progress", { modpackId, stage: "done", progress: 100 });
  return { success: true, totalFiles: total };
});

// Content folders scanned for the instance-manager view (mods/shaders/resourcepacks
// tabs) — anything found here that isn't part of the published manifest is an
// "optional" file the player added themselves (manually or via Modrinth).
const CONTENT_DIRS = ["mods", "shaderpacks", "resourcepacks"];

ipcMain.handle("mc:list-instance-files", async (_, { modpackId }) => {
  const instanceDir = path.join(INSTANCES_DIR, modpackId);
  const out = [];
  for (const dir of CONTENT_DIRS) {
    const full = path.join(instanceDir, dir);
    let entries;
    try {
      entries = await fs.readdir(full, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(full, entry.name);
      try {
        const stat = await fs.stat(filePath);
        const sha1 = await hashFileSha1(filePath).catch(() => null);
        out.push({ path: `${dir}/${entry.name}`, size: stat.size, sha1 });
      } catch {}
    }
  }
  return out;
});

ipcMain.handle("mc:delete-instance-file", async (_, { modpackId, path: relPath }) => {
  const instanceDir = path.join(INSTANCES_DIR, modpackId);
  const target = safeJoin(instanceDir, relPath);
  await fs.unlink(target);
  // Remember this so a future update doesn't silently re-download a file the
  // user deliberately removed, as long as it stays optional in the manifest.
  const metaPath = path.join(instanceDir, "alaunchi-meta.json");
  try {
    const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    const removed = new Set(Array.isArray(meta.removedOptionalPaths) ? meta.removedOptionalPaths : []);
    removed.add(relPath);
    meta.removedOptionalPaths = Array.from(removed);
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  } catch {}
  return { success: true };
});

ipcMain.handle("mc:update-instance-file", async (_, { modpackId, oldPath, newPath, url, sha1 }) => {
  const instanceDir = path.join(INSTANCES_DIR, modpackId);
  const target = safeJoin(instanceDir, newPath);
  const oldTarget = safeJoin(instanceDir, oldPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmpPath = `${target}.tmp.${process.pid}.${Date.now().toString(36)}`;
  try {
    await downloadFile(url, tmpPath, null);
    if (sha1) {
      const actual = await hashFileSha1(tmpPath);
      if (actual !== sha1) throw new Error("Hash mismatch al descargar la actualización.");
    }
    await fs.rename(tmpPath, target);
  } catch (e) {
    await fs.unlink(tmpPath).catch(() => {});
    throw e;
  }
  if (oldPath !== newPath) {
    await fs.unlink(oldTarget).catch(() => {});
  }
  return { success: true, newPath };
});

ipcMain.handle("mc:download-instance-file", async (_, { modpackId, path: relPath, url, sha1 }) => {
  const instanceDir = path.join(INSTANCES_DIR, modpackId);
  const target = safeJoin(instanceDir, relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmpPath = `${target}.tmp.${process.pid}.${Date.now().toString(36)}`;
  try {
    await downloadFile(url, tmpPath, null);
    if (sha1) {
      const actual = await hashFileSha1(tmpPath);
      if (actual !== sha1) throw new Error("Hash mismatch al descargar el archivo.");
    }
    await fs.rename(tmpPath, target);
  } catch (e) {
    await fs.unlink(tmpPath).catch(() => {});
    throw e;
  }
  return { success: true };
});

ipcMain.handle("mc:launch", async (event, { modpackId, mcVersion, loaderType, authToken, username, uuid, xuid, clientId }) => {
  const effectiveClientId = clientId || LAUNCHER_CONFIG.azureClientId || "";
  if (!xuid) {
    console.warn(`[mc:launch] WARNING: launching with empty --xuid. Online server joins will fail with "Sesión no válida". User should re-login with Microsoft.`);
  }
  if (!effectiveClientId) {
    console.warn(`[mc:launch] WARNING: launching with empty --clientId. Online server joins may fail.`);
  }
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.webContents.send("launch-status", { modpackId, stage: "preparing" });

  const versionManifest = await fetchJson("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json");
  const versionEntry = versionManifest.versions.find((v) => v.id === mcVersion);
  if (!versionEntry) throw new Error(`Minecraft version ${mcVersion} not found`);

  const versionJson = await fetchJson(versionEntry.url);
  const versionDir = path.join(CACHE_DIR, "versions", mcVersion);
  const librariesDir = path.join(CACHE_DIR, "libraries");
  const assetsDir = path.join(CACHE_DIR, "assets");
  const nativesDir = path.join(CACHE_DIR, "natives", mcVersion);

  await fs.mkdir(versionDir, { recursive: true });
  await fs.mkdir(librariesDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.mkdir(nativesDir, { recursive: true });

  win?.webContents.send("launch-status", { modpackId, stage: "downloading_client" });
  const clientJarPath = path.join(versionDir, `${mcVersion}.jar`);
  if (!fsSync.existsSync(clientJarPath)) {
    await downloadFile(versionJson.downloads.client.url, clientJarPath, () => {});
  }

  win?.webContents.send("launch-status", { modpackId, stage: "downloading_assets" });
  const assetIndexId = versionJson.assetIndex.id;
  const assetIndexDir = path.join(assetsDir, "indexes");
  await fs.mkdir(assetIndexDir, { recursive: true });
  const assetIndexPath = path.join(assetIndexDir, `${assetIndexId}.json`);
  if (!fsSync.existsSync(assetIndexPath)) {
    await downloadFile(versionJson.assetIndex.url, assetIndexPath, () => {});
  }

  const assetIndex = JSON.parse(await fs.readFile(assetIndexPath, "utf8"));
  const objectsDir = path.join(assetsDir, "objects");
  const assetEntries = Object.entries(assetIndex.objects || {});
  let downloadedAssets = 0;
  const ASSET_BATCH = 20;

  for (let i = 0; i < assetEntries.length; i += ASSET_BATCH) {
    const batch = assetEntries.slice(i, i + ASSET_BATCH);
    await Promise.all(
      batch.map(async ([, obj]) => {
        const hash = obj.hash;
        const prefix = hash.substring(0, 2);
        const assetDir = path.join(objectsDir, prefix);
        await fs.mkdir(assetDir, { recursive: true });
        const assetPath = path.join(assetDir, hash);
        if (!fsSync.existsSync(assetPath)) {
          await downloadFile(`https://resources.download.minecraft.net/${prefix}/${hash}`, assetPath, () => {});
        }
      })
    );
    downloadedAssets += batch.length;
    win?.webContents.send("launch-status", {
      modpackId, stage: "downloading_assets",
      progress: Math.round((downloadedAssets / assetEntries.length) * 100),
    });
  }

  win?.webContents.send("launch-status", { modpackId, stage: "downloading_libraries" });
  const classpath = [clientJarPath];
  const currentPlatform = process.platform.replace("win32", "windows").replace("darwin", "osx");

  for (const lib of versionJson.libraries || []) {
    if (lib.rules) {
      const allowed = lib.rules.every((rule) => {
        if (rule.action === "allow") return !rule.os || rule.os.name === currentPlatform;
        if (rule.action === "disallow") return rule.os && rule.os.name !== currentPlatform;
        return true;
      });
      if (!allowed) continue;
    }
    if (lib.downloads?.artifact) {
      const artifact = lib.downloads.artifact;
      const libPath = path.join(librariesDir, artifact.path);
      await fs.mkdir(path.dirname(libPath), { recursive: true });
      if (!fsSync.existsSync(libPath)) await downloadFile(artifact.url, libPath, () => {});
      classpath.push(libPath);
    }
  }

  const instanceDir = path.join(INSTANCES_DIR, modpackId);
  const modsDir = path.join(instanceDir, "mods");
  await fs.mkdir(modsDir, { recursive: true });

  win?.webContents.send("launch-status", { modpackId, stage: "downloading_libraries" });

  let mainClass = versionJson.mainClass;
  let loaderProfile = null;
  let loaderLibsDir = librariesDir;

  if (loaderType === "fabric" || loaderType === "quilt") {
    try {
      win?.webContents.send("launch-status", { modpackId, stage: "installing_loader" });
      const loaderMeta = await fetchJson("https://meta.fabricmc.net/v2/versions/loader");
      const latestLoader = loaderMeta[0].version;
      const fabricProfile = await fetchJson(
        `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${latestLoader}/profile/json`
      );
      loaderProfile = fabricProfile;
      mainClass = fabricProfile.mainClass;
      for (const lib of fabricProfile.libraries || []) {
        const parts = lib.name.split(":");
        const [group, artifact, ver] = parts;
        const groupPath = group.replace(/\./g, "/");
        const jarName = `${artifact}-${ver}.jar`;
        const relPath = `${groupPath}/${artifact}/${ver}/${jarName}`;
        const libPath = path.join(librariesDir, relPath);
        await fs.mkdir(path.dirname(libPath), { recursive: true });
        if (!fsSync.existsSync(libPath)) {
          const baseUrl = lib.url || "https://repo1.maven.org/maven2/";
          await downloadFile(baseUrl + relPath, libPath, () => {});
        }
        classpath.push(libPath);
      }
    } catch (e) {
      console.error("[Fabric] Error:", e.message);
    }
  }

  if (loaderType === "neoforge") {
    try {
      win?.webContents.send("launch-status", { modpackId, stage: "installing_loader" });
      const neoforgeVersion = await resolveNeoforgeVersion(mcVersion);
      if (!neoforgeVersion) throw new Error(`No se encontró NeoForge para MC ${mcVersion}`);
      console.log(`[NeoForge] Usando versión ${neoforgeVersion}`);
      const { profile, installLibsDir } = await runForgeInstallerDirect(
        "neoforge", neoforgeVersion, mcVersion, clientJarPath, librariesDir,
        (msg) => win?.webContents.send("launch-status", { modpackId, stage: "installing_loader", msg })
      );
      loaderProfile = profile;
      loaderLibsDir = installLibsDir;
      if (profile.mainClass) mainClass = profile.mainClass;
      for (const lib of profile.libraries || []) {
        const libPath = await resolveModloaderLibrary(lib, librariesDir, [
          "https://maven.neoforged.net/releases/",
          "https://libraries.minecraft.net/",
          "https://repo1.maven.org/maven2/",
        ], installLibsDir);
        if (libPath) classpath.push(libPath);
      }
    } catch (e) {
      console.error("[NeoForge] Error:", e.message);
      throw new Error(`No se pudo instalar NeoForge para MC ${mcVersion}: ${e.message}`);
    }
  }

  if (loaderType === "forge") {
    try {
      win?.webContents.send("launch-status", { modpackId, stage: "installing_loader" });
      const forgeVersion = await resolveForgeVersion(mcVersion);
      if (!forgeVersion) throw new Error(`No se encontró Forge para MC ${mcVersion}`);
      console.log(`[Forge] Usando versión ${forgeVersion}`);
      const { profile, installLibsDir } = await runForgeInstallerDirect(
        "forge", forgeVersion, mcVersion, clientJarPath, librariesDir,
        (msg) => win?.webContents.send("launch-status", { modpackId, stage: "installing_loader", msg })
      );
      loaderProfile = profile;
      loaderLibsDir = installLibsDir;
      if (profile.mainClass) mainClass = profile.mainClass;
      for (const lib of profile.libraries || []) {
        const libPath = await resolveModloaderLibrary(lib, librariesDir, [
          "https://maven.minecraftforge.net/",
          "https://libraries.minecraft.net/",
          "https://repo1.maven.org/maven2/",
        ], installLibsDir);
        if (libPath) classpath.push(libPath);
      }
    } catch (e) {
      console.error("[Forge] Error:", e.message);
      throw new Error(`No se pudo instalar Forge para MC ${mcVersion}: ${e.message}`);
    }
  }

  win?.webContents.send("launch-status", { modpackId, stage: "extracting_natives" });
  await extractNatives(versionJson.libraries || [], nativesDir);

  win?.webContents.send("launch-status", { modpackId, stage: "launching" });

  const requiredJavaMajor = versionJson.javaVersion?.majorVersion ?? 8;
  let javaPath = await getJavaPathForMajor(requiredJavaMajor);
  if (!javaPath) {
    // Only reuse the system Java if it's an exact major match — old Forge (Java 8)
    // launched under a newer system JRE (17/21) crashes or misbehaves, so a
    // ">=" check here would silently pick a wrong-but-newer runtime.
    try {
      const { stdout, stderr } = await execAsync("java -version 2>&1");
      const m = (stdout || stderr).match(/version "(\d+)/);
      const systemMajor = parseInt(m?.[1] || "0");
      if (systemMajor === requiredJavaMajor) javaPath = "java";
    } catch {}
  }
  if (!javaPath) {
    win?.webContents.send("launch-status", { modpackId, stage: "installing_java", javaMajor: requiredJavaMajor, progress: 0 });
    try {
      javaPath = await installJavaMajor(requiredJavaMajor, (p) => {
        win?.webContents.send("launch-status", {
          modpackId,
          stage: "installing_java",
          javaMajor: requiredJavaMajor,
          javaSubstage: p.stage,
          progress: p.progress ?? 0,
        });
      });
    } catch (e) {
      throw new Error(`Java ${requiredJavaMajor} requerido y no se pudo instalar automáticamente: ${e.message}`);
    }
  }

  let maxMemory = "2G";
  try {
    const settings = JSON.parse(await fs.readFile(path.join(APP_DATA_DIR, "settings.json"), "utf8"));
    if (settings.maxMemoryMb && settings.maxMemoryMb >= 512) maxMemory = `${settings.maxMemoryMb}M`;
  } catch {}

  const dedupedClasspath = [...new Set(classpath)];

  // Defensive: if a malformed UUID somehow reaches the launch handler (e.g. from an
  // auth.json saved before validation fixes), normalize it to a valid UUID so the
  // game doesn't crash with NumberFormatException in UndashedUuid.fromStringLenient.
  const safeUUID = validateUUID(uuid) || "00000000-0000-0000-0000-000000000000";
  if (safeUUID !== uuid) console.warn(`[mc:launch] UUID normalizado: "${uuid}" → "${safeUUID}"`);

  const mcArgs = buildLaunchArgs({ ...versionJson, mainClass }, {
    username: username || "Player",
    uuid: safeUUID,
    xuid: xuid || "",
    clientId: effectiveClientId,
    accessToken: authToken || "offline",
    gameDir: instanceDir,
    assetsDir,
    assetIndex: assetIndexId,
    version: mcVersion,
    classpath: dedupedClasspath.join(path.delimiter),
    nativesDir,
    librariesDir: loaderLibsDir,
    mcVersion,
    width: "1280",
    height: "720",
    maxMemory,
    minMemory: "512M",
  }, loaderProfile);

  console.log("[Launch] Java:", javaPath);
  console.log("[Launch] MainClass:", mainClass);
  console.log("[Launch] Args count:", mcArgs.length);

  // Diagnostic: dump the resolved game args with token redacted so we can see
  // exactly what's reaching the JVM. The launch.log only contains stdout/stderr
  // from the game, so we write args to a separate file for inspection.
  const redactedArgs = mcArgs.map((a) => {
    if (typeof a !== "string") return String(a);
    if (authToken && a.includes(authToken)) return a.replace(authToken, "<REDACTED_TOKEN>");
    return a;
  });
  const xuidIdx = redactedArgs.indexOf("--xuid");
  const clientIdIdx = redactedArgs.indexOf("--clientId");
  const userTypeIdx = redactedArgs.indexOf("--userType");
  const uuidIdx = redactedArgs.indexOf("--uuid");
  const diagnostic = [
    `=== ALaunchi launch diagnostic (${new Date().toISOString()}) ===`,
    `mcVersion: ${mcVersion}`,
    `loaderType: ${loaderType}`,
    `username: ${username}`,
    `uuid passed: ${uuid}`,
    `uuid normalized: ${safeUUID}`,
    `xuid: ${xuid ? `"${xuid}" (len=${xuid.length})` : "(EMPTY)"}`,
    `clientId: ${effectiveClientId ? `"${effectiveClientId}" (len=${effectiveClientId.length})` : "(EMPTY)"}`,
    `authToken: ${authToken ? `len=${authToken.length}, starts=${authToken.slice(0, 12)}...` : "(EMPTY)"}`,
    `--xuid arg position: ${xuidIdx >= 0 ? `${xuidIdx} → value="${redactedArgs[xuidIdx + 1]}"` : "(NOT IN ARGS)"}`,
    `--clientId arg position: ${clientIdIdx >= 0 ? `${clientIdIdx} → value="${redactedArgs[clientIdIdx + 1]}"` : "(NOT IN ARGS)"}`,
    `--userType arg position: ${userTypeIdx >= 0 ? `${userTypeIdx} → value="${redactedArgs[userTypeIdx + 1]}"` : "(NOT IN ARGS)"}`,
    `--uuid arg position: ${uuidIdx >= 0 ? `${uuidIdx} → value="${redactedArgs[uuidIdx + 1]}"` : "(NOT IN ARGS)"}`,
    ``,
    `=== Full resolved args ===`,
    ...redactedArgs.map((a, i) => `[${i}] ${a}`),
    ``,
  ].join("\n");
  try {
    await fs.mkdir(instanceDir, { recursive: true });
    await fs.writeFile(path.join(instanceDir, "launch-args.log"), diagnostic);
    console.log("[Launch] Diagnostic written to:", path.join(instanceDir, "launch-args.log"));
  } catch (e) {
    console.warn("[Launch] Could not write diagnostic:", e.message);
  }

  const logFile = path.join(instanceDir, "launch.log");
  let logFd;
  try {
    await fs.mkdir(instanceDir, { recursive: true });
    logFd = fsSync.openSync(logFile, "w");
  } catch { logFd = null; }

  const stdio = logFd !== null
    ? ["ignore", logFd, logFd]
    : ["ignore", "ignore", "ignore"];

  const child = spawn(javaPath, mcArgs, { detached: true, stdio });
  if (logFd !== null) fsSync.closeSync(logFd);

  child.on("error", (err) => {
    console.error("[Launch] Spawn error:", err.message);
    win?.webContents.send("launch-status", { modpackId, stage: "error", message: err.message });
  });

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const exitCode = child.exitCode;
  if (exitCode !== null && exitCode !== 0) {
    let logContent = "";
    try { logContent = (await fs.readFile(logFile, "utf8")).slice(-5000); } catch {}
    console.error("[Launch] Java crashed (code", exitCode, "):\n", logContent);
    win?.webContents.send("launch-status", { modpackId, stage: "error", message: `Java salió con código ${exitCode}` });
    throw new Error(`Java salió con código ${exitCode}. Log guardado en: ${logFile}`);
  }

  if (child.exitCode === 0) {
    console.warn("[Launch] Java exited cleanly (code 0) — could be a quick crash, check log:", logFile);
  }

  const playtimeStartedAt = Date.now();
  try {
    const metaPath = path.join(instanceDir, "alaunchi-meta.json");
    const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    meta.activeSession = { pid: child.pid, startedAt: playtimeStartedAt };
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    watchProcessForPlaytime(modpackId, child.pid, playtimeStartedAt);
  } catch (e) {
    console.warn("[Playtime] No se pudo iniciar el seguimiento de tiempo jugado:", e.message);
  }

  child.unref();
  win?.webContents.send("launch-status", { modpackId, stage: "launched" });
  return { success: true, pid: child.pid };
});

async function resolveNeoforgeVersion(mcVersion) {
  try {
    const data = await fetchJson(
      "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge"
    );
    const versions = data.versions || [];
    const parts = mcVersion.split(".");
    const major = parts[1];
    const minor = parts[2] || "0";
    let prefix;
    if (mcVersion === "1.20.1") {
      prefix = "47.";
    } else {
      prefix = `${major}.${minor}.`;
    }
    const matching = versions.filter((v) => v.startsWith(prefix));
    if (!matching.length) return null;
    return matching[matching.length - 1];
  } catch {
    return null;
  }
}

async function resolveForgeVersion(mcVersion) {
  try {
    const data = await fetchJson(
      "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"
    );
    const promos = data.promos || {};
    return promos[`${mcVersion}-recommended`] || promos[`${mcVersion}-latest`] || null;
  } catch {
    return null;
  }
}

// ─── FORGE/NEOFORGE — INSTALACIÓN DIRECTA (inspirada en Prism Launcher) ─────
// En lugar de ejecutar el instalador JAR (que escribe en ~/.minecraft),
// extraemos install_profile.json y version.json directamente del JAR,
// descargamos las librerías y ejecutamos los procesadores nosotros mismos.
// ─────────────────────────────────────────────────────────────────────────────

function readZipEntry(zipPath, entryName) {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntry(entryName);
  if (!entry) throw new Error(`Entrada no encontrada en JAR: ${entryName}`);
  return entry.getData();
}

function mavenCoordToPath(coord) {
  let ext = "jar";
  if (coord.includes("@")) [coord, ext] = coord.split("@");
  const parts = coord.split(":");
  const [group, artifact, version, classifier] = parts;
  const groupPath = group.replace(/\./g, "/");
  const filename = classifier
    ? `${artifact}-${version}-${classifier}.${ext}`
    : `${artifact}-${version}.${ext}`;
  return `${groupPath}/${artifact}/${version}/${filename}`;
}

async function runForgeInstallerDirect(loaderType, loaderVersion, mcVersion, clientJarPath, libsDir, sendStatus) {
  // v4 cache key: also stores a manifest of processor output paths so we can detect
  // incomplete processor runs (processors that failed silently leave the profile cached
  // but the output JARs missing — game then crashes with NoClassDefFoundError).
  const cacheKey = `${loaderType}-${loaderVersion}-v4`;
  const profileCachePath = path.join(CACHE_DIR, `${cacheKey}-profile.json`);
  const outputsCachePath = path.join(CACHE_DIR, `${cacheKey}-outputs.json`);

  if (fsSync.existsSync(profileCachePath) && fsSync.existsSync(outputsCachePath)) {
    try {
      const expectedOutputs = JSON.parse(await fs.readFile(outputsCachePath, "utf8"));
      const allExist = expectedOutputs.every((p) => fsSync.existsSync(p));
      if (allExist) {
        console.log(`[${loaderType}] Usando perfil cacheado (${expectedOutputs.length} outputs verificados)`);
        const profile = JSON.parse(await fs.readFile(profileCachePath, "utf8"));
        return { profile, installLibsDir: libsDir };
      }
      // At least one processor output is missing — nuke the cache and re-run.
      const missing = expectedOutputs.filter((p) => !fsSync.existsSync(p));
      console.warn(`[${loaderType}] Cache inválido — ${missing.length} output(s) faltan, re-ejecutando procesadores:`);
      missing.forEach((p) => console.warn("  MISSING:", p));
      await Promise.all([
        fs.unlink(profileCachePath).catch(() => {}),
        fs.unlink(outputsCachePath).catch(() => {}),
      ]);
    } catch (e) {
      console.warn(`[${loaderType}] Error leyendo cache:`, e.message);
      await Promise.all([
        fs.unlink(profileCachePath).catch(() => {}),
        fs.unlink(outputsCachePath).catch(() => {}),
      ]);
    }
  } else if (fsSync.existsSync(profileCachePath)) {
    // Old cache without outputs manifest — invalidate so we rebuild with output tracking.
    console.warn(`[${loaderType}] Cache sin manifest de outputs — invalidando para re-ejecutar procesadores`);
    await fs.unlink(profileCachePath).catch(() => {});
  }

  let installerFilename, installerUrl;
  if (loaderType === "neoforge") {
    installerFilename = `neoforge-${loaderVersion}-installer.jar`;
    installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/${installerFilename}`;
  } else {
    const fullVersion = `${mcVersion}-${loaderVersion}`;
    installerFilename = `forge-${fullVersion}-installer.jar`;
    installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersion}/${installerFilename}`;
  }

  const installerPath = path.join(CACHE_DIR, installerFilename);
  sendStatus?.("Descargando instalador...");
  await downloadFile(installerUrl, installerPath, () => {});

  sendStatus?.("Leyendo perfil...");
  let installProfile, versionJson;
  try {
    installProfile = JSON.parse(readZipEntry(installerPath, "install_profile.json").toString("utf8"));
    versionJson    = JSON.parse(readZipEntry(installerPath, "version.json").toString("utf8"));
  } catch (e) {
    await fs.unlink(installerPath).catch(() => {});
    throw new Error(`No se pudo leer el instalador de ${loaderType}: ${e.message}`);
  }

  sendStatus?.("Extrayendo librerías internas...");
  try {
    const zip = new AdmZip(installerPath);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.startsWith("maven/")) continue;
      const relPath = entry.entryName.slice("maven/".length);
      const destPath = path.join(libsDir, relPath);
      if (fsSync.existsSync(destPath)) continue;
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, entry.getData());
    }
  } catch (e) {
    console.warn(`[${loaderType}] No se pudo extraer maven/ interno:`, e.message);
  }

  sendStatus?.("Descargando dependencias del loader...");
  const mavenBases = loaderType === "neoforge"
    ? ["https://maven.neoforged.net/releases/", "https://libraries.minecraft.net/", "https://repo1.maven.org/maven2/"]
    : ["https://maven.minecraftforge.net/", "https://libraries.minecraft.net/", "https://repo1.maven.org/maven2/"];

  // Union of installProfile.libraries (install-time/processor deps, modern installers) and
  // versionJson.libraries (the final launch classpath, checked further down). Old-format
  // installers (pre-1.13 Forge) don't have a top-level install_profile.json#libraries at
  // all — everything the game needs at launch lives only in versionJson.libraries — so
  // downloading just the first list silently fetched nothing for them.
  const libsToFetch = [...(installProfile.libraries || []), ...(versionJson.libraries || [])];
  const seenLibKeys = new Set();
  for (const lib of libsToFetch) {
    const key = lib.name || lib.downloads?.artifact?.path;
    if (!key || seenLibKeys.has(key)) continue;
    seenLibKeys.add(key);
    await resolveModloaderLibrary(lib, libsDir, mavenBases, null).catch((e) =>
      console.warn(`[${loaderType}] Librería no descargable:`, lib.name || "", e.message)
    );
  }

  // Forge/NeoForge processors (BinaryPatcher, Jar Splitter, etc.) expect the vanilla client jar
  // and Mojang's client mappings to live inside libsDir at their maven coordinates. If they are
  // missing, processors fail silently and the patched minecraft jar is never generated, which
  // makes the game crash at launch with "Mod ID 'minecraft' [MISSING]" / NoClassDefFoundError on
  // net.minecraft.* classes.
  sendStatus?.("Preparando cliente y mappings de Minecraft...");
  try {
    const mcLibDir = path.join(libsDir, "net", "minecraft", "client", mcVersion);
    await fs.mkdir(mcLibDir, { recursive: true });

    const mcLibJar = path.join(mcLibDir, `client-${mcVersion}.jar`);
    if (!fsSync.existsSync(mcLibJar)) await fs.copyFile(clientJarPath, mcLibJar);

    // versionJson here is the loader's version.json from the installer — it does NOT have
    // downloads.client_mappings. Fetch the vanilla manifest entry to get the mappings URL.
    const mappingsPath = path.join(mcLibDir, `client-${mcVersion}-mappings.txt`);
    if (!fsSync.existsSync(mappingsPath)) {
      try {
        const vanillaManifest = await fetchJson("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json");
        const vEntry = vanillaManifest.versions.find((v) => v.id === mcVersion);
        if (vEntry) {
          const vJson = await fetchJson(vEntry.url);
          const mappingsUrl = vJson.downloads?.client_mappings?.url;
          if (mappingsUrl) await downloadFile(mappingsUrl, mappingsPath, () => {});
        }
      } catch (e) {
        console.warn(`[${loaderType}] No se pudieron descargar los mappings de MC ${mcVersion}:`, e.message);
      }
    }
  } catch (e) {
    console.warn(`[${loaderType}] Error preparando cliente vanilla en libsDir:`, e.message);
  }

  sendStatus?.("Ejecutando procesadores (solo primera vez)...");
  // Processors run under the loader's own required Java major, which can differ
  // from whatever else is already cached — resolve/download it the same way the
  // final launch does instead of assuming a globally-installed JRE.
  const loaderJavaMajor = versionJson.javaVersion?.majorVersion ?? 21;
  let javaExe = await getJavaPathForMajor(loaderJavaMajor);
  if (!javaExe) {
    try {
      const { stdout, stderr } = await execAsync("java -version 2>&1");
      const m = (stdout || stderr).match(/version "(\d+)/);
      if (parseInt(m?.[1] || "0") === loaderJavaMajor) javaExe = "java";
    } catch {}
  }
  if (!javaExe) {
    sendStatus?.(`Descargando Java ${loaderJavaMajor} (necesario para instalar ${loaderType})...`);
    javaExe = await installJavaMajor(loaderJavaMajor, (p) => {
      if (p.stage === "downloading") sendStatus?.(`Descargando Java ${loaderJavaMajor}... ${p.progress}%`);
    });
  }

  const data = installProfile.data || {};
  // NeoForge processors (DownloadMojmaps, ChainMappings, JarSplitter, BinaryPatcher, Fart)
  // reference these placeholders inline in their arg lists. They are NOT in installProfile.data
  // — they are runtime context. If we don't pre-seed them, args like "--side {SIDE}" are passed
  // literally and DownloadMojmaps fails with "Missing download info for {SIDE} mappings", which
  // cascades into every downstream processor and leaves the patched client-*-srg.jar /
  // client-*-extra.jar missing — game then crashes with NoClassDefFoundError on net.minecraft.*
  const resolvedData = {
    MINECRAFT_JAR: clientJarPath,
    INSTALLER: installerPath,
    SIDE: "client",
    MINECRAFT_VERSION: mcVersion,
    ROOT: libsDir,
    LIBRARY_DIR: libsDir,
  };

  // Track which resolvedData entries are file paths inside libsDir so we can verify
  // processor outputs after they run (and detect silent processor failures on cache load).
  const expectedOutputPaths = new Set();

  for (const [key, val] of Object.entries(data)) {
    const raw = (val.client || "").trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const p = path.join(libsDir, mavenCoordToPath(raw.slice(1, -1)));
      resolvedData[key] = p;
      expectedOutputPaths.add(p);
    } else if (raw.startsWith("/")) {
      const extractPath = path.join(CACHE_DIR, `fdata-${key}`);
      if (!fsSync.existsSync(extractPath)) {
        try { await fs.writeFile(extractPath, readZipEntry(installerPath, raw.slice(1))); } catch {}
      }
      resolvedData[key] = extractPath;
    } else {
      resolvedData[key] = raw;
    }
  }

  const processors = (installProfile.processors || []).filter(
    (p) => !p.sides || p.sides.includes("client")
  );

  for (let i = 0; i < processors.length; i++) {
    const proc = processors[i];
    sendStatus?.(`Procesador ${i + 1}/${processors.length}...`);

    const jarPath = path.join(libsDir, mavenCoordToPath(proc.jar));
    if (!fsSync.existsSync(jarPath)) { console.warn(`[Processor] JAR no encontrado: ${jarPath}`); continue; }

    let mainClass = null;
    try {
      const manifest = readZipEntry(jarPath, "META-INF/MANIFEST.MF").toString("utf8");
      const m = manifest.match(/Main-Class:\s*(.+)/);
      mainClass = m ? m[1].trim() : null;
    } catch {}
    if (!mainClass) { console.warn(`[Processor] Sin Main-Class: ${jarPath}`); continue; }

    const classpath = [jarPath, ...(proc.classpath || [])
      .map((dep) => path.join(libsDir, mavenCoordToPath(dep)))
      .filter((p) => fsSync.existsSync(p))];

    const args = (proc.args || []).map((arg) => {
      if (arg.startsWith("[") && arg.endsWith("]")) return path.join(libsDir, mavenCoordToPath(arg.slice(1, -1)));
      if (arg.startsWith("{") && arg.endsWith("}")) return resolvedData[arg.slice(1, -1)] ?? arg;
      return arg;
    });

    try {
      const cpStr = classpath.join(path.delimiter);
      const argsStr = args.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(" ");
      // Processors (BinaryPatcher, JarSplitter, etc.) need extra heap — default 256m is too
      // little for patching the 1.21 client. 1 GB is enough for all known NeoForge/Forge steps.
      const result = await execAsync(`"${javaExe}" -Xmx1g -cp "${cpStr}" ${mainClass} ${argsStr}`, {
        timeout: 300000, maxBuffer: 40 * 1024 * 1024,
      });
      if (result.stdout) console.log(`[Processor ${i + 1}] stdout:`, result.stdout.slice(-200));
    } catch (e) {
      // Log the full stderr so OOM / class-not-found errors are visible in the console.
      const fullErr = [e.stderr, e.stdout, e.message].filter(Boolean).join("\n");
      console.error(`[Processor ${i + 1}] Falló (stderr completo):\n${fullErr}`);
    }
  }

  // Verify that all files referenced by the launcher's classpath (versionJson.libraries) exist.
  // These are the files Java will actually need at launch time — intermediate files in
  // installProfile.data (like *-unpacked.jar) may not all survive to disk and that's fine.
  const requiredLaunchFiles = [];
  for (const lib of versionJson.libraries || []) {
    if (lib.downloads?.artifact?.path) {
      requiredLaunchFiles.push(path.join(libsDir, lib.downloads.artifact.path));
    } else if (lib.name) {
      const parts = lib.name.split(":");
      if (parts.length >= 3) {
        requiredLaunchFiles.push(path.join(libsDir, mavenCoordToPath(lib.name)));
      }
    }
  }

  const missingLaunchFiles = requiredLaunchFiles.filter((p) => !fsSync.existsSync(p));
  if (missingLaunchFiles.length > 0) {
    console.error(`[${loaderType}] ${missingLaunchFiles.length} archivo(s) de classpath FALTAN tras la instalación:`);
    missingLaunchFiles.slice(0, 10).forEach((p) => console.error("  MISSING:", p));
    throw new Error(
      `La instalación de ${loaderType} no completó: faltan ${missingLaunchFiles.length} archivo(s) del classpath.\n` +
      `Primer archivo faltante: ${missingLaunchFiles[0]}\n` +
      `Inténtalo de nuevo o reduce la RAM asignada en Ajustes si Java se queda sin memoria.`
    );
  }

  // Soft check: log warnings for missing installProfile.data entries but don't fail.
  // Some data keys (like UNPACKED in NeoForge) are intermediate-only and not all survive to disk.
  const dataOutputsList = [...expectedOutputPaths];
  const missingDataOutputs = dataOutputsList.filter((p) => !fsSync.existsSync(p));
  if (missingDataOutputs.length > 0) {
    console.warn(`[${loaderType}] ${missingDataOutputs.length} archivo(s) intermedios faltan (no crítico):`);
    missingDataOutputs.slice(0, 5).forEach((p) => console.warn("  ", p));
  }

  await fs.unlink(installerPath).catch(() => {});
  // Cache profile + classpath manifest. Next launch verifies these critical files still exist.
  await fs.writeFile(profileCachePath, JSON.stringify(versionJson, null, 2));
  await fs.writeFile(outputsCachePath, JSON.stringify(requiredLaunchFiles, null, 2));
  console.log(`[${loaderType}] Instalación completada y cacheada (${requiredLaunchFiles.length} archivos de classpath verificados)`);
  return { profile: versionJson, installLibsDir: libsDir };
}

async function extractNatives(libraries, nativesDir) {
  const platform = process.platform === "win32" ? "windows"
    : process.platform === "darwin" ? "osx" : "linux";

  for (const lib of libraries) {
    if (!lib.natives) continue;
    const nativeKey = lib.natives[platform];
    if (!nativeKey) continue;
    const classifierInfo = lib.downloads?.classifiers?.[nativeKey];
    if (!classifierInfo?.path) continue;

    const libPath = path.join(CACHE_DIR, "libraries", classifierInfo.path);
    if (!fsSync.existsSync(libPath) && classifierInfo.url) {
      await fs.mkdir(path.dirname(libPath), { recursive: true });
      await downloadFile(classifierInfo.url, libPath, () => {}).catch(() => {});
    }
    if (!fsSync.existsSync(libPath)) continue;

    try {
      const excludes = lib.extract?.exclude || [];
      const zip = new AdmZip(libPath);
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        if (excludes.some((ex) => entry.entryName.startsWith(ex))) continue;
        const dest = path.join(nativesDir, path.basename(entry.entryName));
        if (!fsSync.existsSync(dest)) await fs.writeFile(dest, entry.getData());
      }
    } catch (e) {
      console.warn("[Natives] Error extrayendo:", libPath, e.message);
    }
  }
}

async function resolveModloaderLibrary(lib, librariesDir, mavenBases, installLibsDir = null) {
  function installerPath(relPath) {
    if (!installLibsDir) return null;
    const p = path.join(installLibsDir, relPath);
    return fsSync.existsSync(p) ? p : null;
  }

  if (lib.downloads?.artifact) {
    const artifact = lib.downloads.artifact;
    const relPath = artifact.path;
    const fromInstaller = installerPath(relPath);
    if (fromInstaller) return fromInstaller;
    const libPath = path.join(librariesDir, relPath);
    await fs.mkdir(path.dirname(libPath), { recursive: true });
    if (!fsSync.existsSync(libPath)) {
      await downloadFile(artifact.url, libPath, () => {});
    }
    return libPath;
  }
  if (lib.name) {
    const parts = lib.name.split(":");
    if (parts.length < 3) return null;
    const [group, artifact, ver, classifier] = parts;
    const groupPath = group.replace(/\./g, "/");
    const jarName = classifier
      ? `${artifact}-${ver}-${classifier}.jar`
      : `${artifact}-${ver}.jar`;
    const relPath = `${groupPath}/${artifact}/${ver}/${jarName}`;
    const fromInstaller = installerPath(relPath);
    if (fromInstaller) return fromInstaller;
    const libPath = path.join(librariesDir, relPath);
    await fs.mkdir(path.dirname(libPath), { recursive: true });
    if (!fsSync.existsSync(libPath)) {
      let lastErr = null;
      for (const base of mavenBases) {
        // A couple of quick retries before giving up on this base — CDN edges
        // (e.g. Mojang's Azure Front Door libraries.minecraft.net) occasionally
        // hit a transient connect timeout that clears up a second later, and
        // that shouldn't be indistinguishable from the library genuinely 404ing.
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await downloadFile(base + relPath, libPath, () => {});
            if (fsSync.existsSync(libPath)) { lastErr = null; break; }
          } catch (e) {
            lastErr = e;
            if (fsSync.existsSync(libPath)) fsSync.unlinkSync(libPath);
            if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
          }
        }
        if (fsSync.existsSync(libPath)) break;
      }
      // Every base failing used to be silent — the only symptom was a generic
      // "N files missing" error much later with no clue why. Log the real reason
      // from the last attempt so a 404 (library genuinely gone) is distinguishable
      // from a timeout (network) at a glance.
      if (lastErr) console.warn(`[resolveModloaderLibrary] No se pudo descargar ${relPath}: ${lastErr.message}`);
    }
    return fsSync.existsSync(libPath) ? libPath : null;
  }
  return null;
}

function buildLaunchArgs(versionJson, opts, loaderProfile = null) {
  const currentPlatformName = process.platform === "win32" ? "windows"
    : process.platform === "darwin" ? "osx" : "linux";

  const argMap = {
    "${auth_player_name}": opts.username,
    "${version_name}": opts.version,
    "${game_directory}": opts.gameDir,
    "${assets_root}": opts.assetsDir,
    "${assets_index_name}": opts.assetIndex,
    "${auth_uuid}": opts.uuid,
    "${auth_access_token}": opts.accessToken,
    "${user_type}": "msa",
    "${version_type}": "release",
    "${resolution_width}": opts.width,
    "${resolution_height}": opts.height,
    "${library_directory}": opts.librariesDir,
    "${classpath_separator}": path.delimiter,
    "${primary_jar}": opts.classpath.split(path.delimiter)[0],
    "${natives_directory}": opts.nativesDir,
    "${launcher_name}": "ALaunchi",
    "${launcher_version}": "1.0",
    "${classpath}": opts.classpath,
    "${clientid}": opts.clientId || "",
    "${auth_xuid}": opts.xuid || "",
  };

  function resolveArg(arg) {
    let resolved = arg;
    for (const [k, v] of Object.entries(argMap)) {
      resolved = resolved.replaceAll(k, v);
    }
    return resolved;
  }

  function evaluateRules(rules) {
    for (const rule of rules || []) {
      if (rule.features) return false;
      if (rule.os) {
        const osMatch = !rule.os.name || rule.os.name === currentPlatformName;
        if (rule.action === "allow" && !osMatch) return false;
        if (rule.action === "disallow" && osMatch) return false;
      }
    }
    return true;
  }

  function expandArgs(rawList) {
    const out = [];
    for (const entry of rawList) {
      if (typeof entry === "string") {
        out.push(resolveArg(entry));
      } else if (entry && typeof entry === "object" && entry.value) {
        if (entry.rules && !evaluateRules(entry.rules)) continue;
        const vals = Array.isArray(entry.value) ? entry.value : [entry.value];
        for (const v of vals) out.push(resolveArg(v));
      }
    }
    return out;
  }

  const baseJvmArgs = [
    `-Xmx${opts.maxMemory || "2G"}`, `-Xms${opts.minMemory || "512M"}`,
    `-Djava.library.path=${opts.nativesDir}`,
    "-Dminecraft.launcher.brand=ALaunchi",
    "-Dminecraft.launcher.version=1.0",
  ];

  const loaderJvmArgs = loaderProfile?.arguments?.jvm
    ? expandArgs(loaderProfile.arguments.jvm)
    : [];

  const classpathArgs = ["-cp", opts.classpath];

  const rawGameArgs = versionJson.arguments?.game || versionJson.minecraftArguments?.split(" ") || [];
  const gameArgs = expandArgs(rawGameArgs);
  const loaderGameArgs = loaderProfile?.arguments?.game
    ? expandArgs(loaderProfile.arguments.game)
    : [];

  const allGameArgs = [...gameArgs, ...loaderGameArgs];

  return [
    ...baseJvmArgs,
    ...loaderJvmArgs,
    ...classpathArgs,
    versionJson.mainClass,
    ...allGameArgs,
  ];
}

function javaBinFor(jreDir) {
  return path.join(jreDir, "bin", process.platform === "win32" ? "java.exe" : "java");
}

// Each Minecraft/loader combo can demand a different Java major version (old Forge
// wants 8, modern NeoForge wants 21, etc.), so we keep one JRE per major version
// side by side under JAVA_DIR/<major> instead of a single global install.
async function getJavaPathForMajor(major) {
  const jreDir = path.join(JAVA_DIR, String(major));
  const bin = javaBinFor(jreDir);
  if (fsSync.existsSync(bin)) return bin;

  // One-time migration: older ALaunchi versions installed a single JRE (always
  // major 21) behind JAVA_DIR/.java-home. Adopt it into the new per-major layout
  // instead of silently re-downloading a JRE the user already has on disk.
  if (major === 21) {
    const legacyHomeFile = path.join(JAVA_DIR, ".java-home");
    if (fsSync.existsSync(legacyHomeFile)) {
      try {
        const legacyDir = (await fs.readFile(legacyHomeFile, "utf8")).trim();
        if (legacyDir && fsSync.existsSync(javaBinFor(legacyDir))) {
          await fs.rename(legacyDir, jreDir);
          await fs.unlink(legacyHomeFile).catch(() => {});
          return javaBinFor(jreDir);
        }
      } catch {}
    }
  }
  return null;
}

async function installJavaMajor(major, onProgress) {
  const platform = process.platform;
  const arch = process.arch;
  const adoptiumOS = platform === "win32" ? "windows" : platform === "darwin" ? "mac" : "linux";
  const adoptiumArch = arch === "arm64" ? "aarch64" : "x64";

  onProgress?.({ stage: "fetching", progress: 0 });

  const releases = await fetchJson(
    `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${adoptiumArch}&image_type=jre&os=${adoptiumOS}&vendor=eclipse`
  );
  if (!releases || releases.length === 0) throw new Error(`No se encontró JRE ${major} en Adoptium`);

  const pkg = releases[0].binary.package;
  const downloadUrl = pkg.link;
  const filename = pkg.name;
  const isZip = filename.endsWith(".zip");
  const downloadPath = path.join(JAVA_DIR, filename);

  onProgress?.({ stage: "downloading", progress: 0 });
  await downloadFile(downloadUrl, downloadPath, (p) => onProgress?.({ stage: "downloading", progress: p }));

  onProgress?.({ stage: "extracting", progress: 0 });
  const extractDir = path.join(JAVA_DIR, `.extract-${major}-${Date.now()}`);
  await fs.mkdir(extractDir, { recursive: true });
  if (isZip) {
    await execAsync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${downloadPath}' -DestinationPath '${extractDir}'"`
    );
  } else {
    await execAsync(`tar -xzf "${downloadPath}" -C "${extractDir}"`);
  }

  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  const jreFolder = entries.find(
    (e) => e.isDirectory() && (e.name.startsWith("jdk") || e.name.startsWith("jre"))
  );
  if (!jreFolder) throw new Error("No se encontró la carpeta del JRE extraído");

  const finalDir = path.join(JAVA_DIR, String(major));
  await fs.rm(finalDir, { recursive: true, force: true }).catch(() => {});
  await fs.rename(path.join(extractDir, jreFolder.name), finalDir);
  await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  await fs.unlink(downloadPath).catch(() => {});

  onProgress?.({ stage: "done", progress: 100 });
  return javaBinFor(finalDir);
}

ipcMain.handle("mc:check-java", async (event, args) => {
  const major = args?.majorVersion ?? 21;
  const customPath = await getJavaPathForMajor(major);
  if (customPath) return { available: true, version: "bundled", path: customPath };
  try {
    const { stdout, stderr } = await execAsync("java -version 2>&1");
    const m = (stdout || stderr).match(/version "(\d+)/);
    const systemMajor = parseInt(m?.[1] || "0");
    if (systemMajor === major) return { available: true, version: (stdout || stderr).split("\n")[0].trim() };
    return { available: false };
  } catch {
    return { available: false };
  }
});

ipcMain.handle("mc:install-java", async (event, args) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const major = args?.majorVersion ?? 21;
  const jrePath = await installJavaMajor(major, (p) =>
    win?.webContents.send("java-install-progress", p)
  );
  return { success: true, jrePath };
});

ipcMain.handle("ms:device-code-auth", async (_, args) => {
  const clientId = args?.clientId || LAUNCHER_CONFIG.azureClientId;
  if (!clientId) return Promise.reject(new Error("Azure Client ID no configurado. Ve a Ajustes e introduce tu Client ID de Azure."));
  return new Promise((resolve, reject) => {
    const postData = `client_id=${clientId}&scope=XboxLive.signin%20offline_access%20openid%20email`;
    const req = https.request({
      hostname: "login.microsoftonline.com",
      path: "/consumers/oauth2/v2.0/devicecode",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(postData) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (p.error) {
            console.error("[MS Auth] Device code error:", p.error, p.error_description);
            return reject(new Error(p.error_description || p.error));
          }
          shell.openExternal(p.verification_uri);
          resolve({ userCode: p.user_code, verificationUri: p.verification_uri, expiresIn: p.expires_in, interval: p.interval, deviceCode: p.device_code });
        } catch (e) { reject(e); }
      });
    });
    req.on("error", (e) => { console.error("[MS Auth] Network error:", e.message); reject(e); });
    req.write(postData);
    req.end();
  });
});

ipcMain.handle("ms:poll-token", async (_, { deviceCode, clientId }) => {
  const cid = clientId || LAUNCHER_CONFIG.azureClientId;
  return new Promise((resolve, reject) => {
    const postData = `grant_type=urn:ietf:params:oauth:grant-type:device_code&client_id=${cid}&device_code=${deviceCode}`;
    const req = https.request({
      hostname: "login.microsoftonline.com",
      path: "/consumers/oauth2/v2.0/token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(postData) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
});

ipcMain.handle("ms:refresh-token", async (_, { refreshToken, clientId }) => {
  const cid = clientId || LAUNCHER_CONFIG.azureClientId;
  return new Promise((resolve, reject) => {
    const postData = `grant_type=refresh_token&client_id=${cid}&refresh_token=${encodeURIComponent(refreshToken)}&scope=XboxLive.signin%20offline_access%20openid%20email`;
    const req = https.request({
      hostname: "login.microsoftonline.com",
      path: "/consumers/oauth2/v2.0/token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(postData) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          resolve(p.access_token ? { access_token: p.access_token, refresh_token: p.refresh_token } : null);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
});

ipcMain.handle("ms:xbox-auth", async (_, { msToken }) => {
  return new Promise((resolve, reject) => {
    if (!msToken) return reject(new Error("Falta el token de Microsoft (msToken). Vuelve a iniciar sesión."));
    const body = JSON.stringify({
      Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${msToken}` },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    });
    const req = https.request({
      hostname: "user.auth.xboxlive.com",
      path: "/user/authenticate",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Accept: "application/json" },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            console.error(`[ms:xbox-auth] Xbox Live rechazó el token (HTTP ${res.statusCode}):`, p);
            return reject(new Error(`Xbox Live rechazó la autenticación (HTTP ${res.statusCode}). ${p?.Message || ""}`.trim()));
          }
          if (!p?.Token || !p?.DisplayClaims?.xui?.[0]?.uhs) {
            console.error(`[ms:xbox-auth] Respuesta inválida:`, p);
            return reject(new Error("Xbox Live devolvió una respuesta sin Token o userHash."));
          }
          resolve({ xblToken: p.Token, userHash: p.DisplayClaims.xui[0].uhs });
        }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
});

ipcMain.handle("ms:xsts-auth", async (_, { xblToken, relyingParty }) => {
  return new Promise((resolve, reject) => {
    if (!xblToken) return reject(new Error("Falta el token de Xbox Live (xblToken)."));
    const body = JSON.stringify({
      Properties: { SandboxId: "RETAIL", UserTokens: [xblToken] },
      RelyingParty: relyingParty || "rp://api.minecraftservices.com/",
      TokenType: "JWT",
    });
    const req = https.request({
      hostname: "xsts.auth.xboxlive.com",
      path: "/xsts/authorize",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Accept: "application/json" },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            // XSTS uses specific XErr codes for common account issues.
            const xerr = p?.XErr;
            const xerrMessages = {
              2148916233: "Esta cuenta de Microsoft no tiene un perfil de Xbox. Inicia sesión en https://www.xbox.com primero.",
              2148916235: "Xbox Live no está disponible en tu país/región.",
              2148916236: "Esta cuenta requiere verificación de adulto (Corea del Sur).",
              2148916237: "Esta cuenta requiere verificación de adulto (Corea del Sur).",
              2148916238: "Esta cuenta es de un menor y debe añadirse a un grupo familiar.",
            };
            const msg = xerrMessages[xerr] || p?.Message || `HTTP ${res.statusCode}`;
            console.error(`[ms:xsts-auth] XSTS rechazó (XErr=${xerr}):`, p);
            return reject(new Error(`XSTS rechazó la autenticación: ${msg}`));
          }
          if (!p?.Token || !p?.DisplayClaims?.xui?.[0]?.uhs) {
            console.error(`[ms:xsts-auth] Respuesta inválida:`, p);
            return reject(new Error("XSTS devolvió una respuesta sin Token o userHash."));
          }
          resolve({ xstsToken: p.Token, userHash: p.DisplayClaims.xui[0].uhs, xuid: p.DisplayClaims.xui[0].xid || "" });
        }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
});

ipcMain.handle("ms:mc-auth", async (_, { xstsToken, userHash }) => {
  return new Promise((resolve, reject) => {
    if (!xstsToken || !userHash) return reject(new Error("Falta xstsToken o userHash para login con Minecraft."));
    const body = JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xstsToken}` });
    const req = https.request({
      hostname: "api.minecraftservices.com",
      path: "/authentication/login_with_xbox",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            console.error(`[ms:mc-auth] Mojang rechazó login_with_xbox (HTTP ${res.statusCode}):`, p);
            return reject(new Error(`Mojang rechazó el login con Xbox (HTTP ${res.statusCode}): ${p?.errorMessage || p?.error || ""}`.trim()));
          }
          if (!p?.access_token) {
            console.error(`[ms:mc-auth] Respuesta sin access_token:`, p);
            return reject(new Error("Mojang devolvió una respuesta sin access_token."));
          }
          resolve({ mcToken: p.access_token });
        }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
});

ipcMain.handle("ms:mc-profile", async (_, { mcToken }) => {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: "api.minecraftservices.com",
      path: "/minecraft/profile",
      headers: { Authorization: `Bearer ${mcToken}` },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          // Reject any non-2xx response or response missing name/id. Previously
          // we silently fell back to username "Player" + zero UUID, which got
          // saved to auth.json and caused launches in offline mode (→ "Sesión
          // no válida" on online servers). It's far better to fail loudly so
          // the user sees a real error and re-logs in.
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            const errMsg = p?.errorMessage || p?.error || `HTTP ${res.statusCode}`;
            console.error(`[ms:mc-profile] Mojang rechazó el perfil: ${errMsg}`, p);
            return reject(new Error(`Mojang rechazó el perfil de Minecraft: ${errMsg}. ¿Tienes Minecraft Java Edition en esta cuenta de Microsoft?`));
          }
          if (!p?.name || !p?.id) {
            console.error(`[ms:mc-profile] Respuesta inválida de Mojang (falta name o id):`, p);
            return reject(new Error("Mojang devolvió un perfil incompleto. Verifica que tu cuenta de Microsoft tiene Minecraft Java Edition."));
          }
          // Mojang profile endpoint returns UUID without dashes (32 hex chars).
          // Minecraft requires UUID with dashes for session join to work on online servers.
          const cleanId = String(p.id).replace(/-/g, "");
          if (cleanId.length !== 32 || !/^[0-9a-fA-F]+$/.test(cleanId)) {
            console.error(`[ms:mc-profile] UUID inválido de Mojang: "${p.id}"`);
            return reject(new Error(`Mojang devolvió un UUID inválido: "${p.id}".`));
          }
          const uuid = `${cleanId.slice(0,8)}-${cleanId.slice(8,12)}-${cleanId.slice(12,16)}-${cleanId.slice(16,20)}-${cleanId.slice(20)}`;
          resolve({ username: p.name, uuid });
        }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
});

// --- Skin manager: change skin/cape on the real Mojang account, plus a local
// library of saved skins (independent of what's currently equipped). ---

ipcMain.handle("mc:get-skin-profile", async (_, { mcToken }) => {
  const res = await httpRequestJson("https://api.minecraftservices.com/minecraft/profile", {
    headers: { Authorization: `Bearer ${mcToken}` },
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(res.body?.errorMessage || res.body?.error || `Mojang devolvió HTTP ${res.statusCode}`);
  }
  return { skins: res.body?.skins ?? [], capes: res.body?.capes ?? [] };
});

ipcMain.handle("mc:change-skin", async (_, { mcToken, variant, fileBase64 }) => {
  const fileBuffer = Buffer.from(fileBase64, "base64");
  const res = await uploadMultipart("https://api.minecraftservices.com/minecraft/profile/skins", {
    headers: { Authorization: `Bearer ${mcToken}` },
    fields: { variant: variant === "slim" ? "slim" : "classic" },
    fileFieldName: "file",
    fileBuffer,
    fileName: "skin.png",
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    console.error("[mc:change-skin] Mojang rechazó la skin:", res.statusCode, res.raw?.slice(0, 300));
    throw new Error(res.body?.errorMessage || res.body?.error || `Mojang rechazó la skin (HTTP ${res.statusCode}). ¿Es un PNG de 64x64?`);
  }
  return { skins: res.body?.skins ?? [], capes: res.body?.capes ?? [] };
});

ipcMain.handle("mc:set-cape", async (_, { mcToken, capeId }) => {
  const url = "https://api.minecraftservices.com/minecraft/profile/capes/active";
  const res = capeId
    ? await httpRequestJson(url, { method: "PUT", headers: { Authorization: `Bearer ${mcToken}` }, body: { capeId } })
    : await httpRequestJson(url, { method: "DELETE", headers: { Authorization: `Bearer ${mcToken}` } });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(res.body?.errorMessage || res.body?.error || `Mojang rechazó el cambio de capa (HTTP ${res.statusCode}).`);
  }
  return { skins: res.body?.skins ?? [], capes: res.body?.capes ?? [] };
});

async function readSkinLibraryIndex() {
  try { return JSON.parse(await fs.readFile(SKIN_LIBRARY_INDEX, "utf8")); }
  catch { return []; }
}

ipcMain.handle("mc:skin-library-list", async () => {
  const index = await readSkinLibraryIndex();
  const entries = [];
  for (const entry of index) {
    try {
      const fileBuffer = await fs.readFile(path.join(SKIN_LIBRARY_DIR, `${entry.id}.png`));
      entries.push({ ...entry, fileBase64: fileBuffer.toString("base64") });
    } catch {
      // Skin file went missing on disk — skip it rather than crash the list.
    }
  }
  return entries;
});

ipcMain.handle("mc:skin-library-save", async (_, { name, variant, fileBase64 }) => {
  const id = crypto.randomUUID();
  const fileBuffer = Buffer.from(fileBase64, "base64");
  await fs.writeFile(path.join(SKIN_LIBRARY_DIR, `${id}.png`), fileBuffer);
  const index = await readSkinLibraryIndex();
  const entry = { id, name: name || "Skin sin nombre", variant: variant === "slim" ? "slim" : "classic", addedAt: new Date().toISOString() };
  index.push(entry);
  await fs.writeFile(SKIN_LIBRARY_INDEX, JSON.stringify(index, null, 2));
  return { ...entry, fileBase64 };
});

ipcMain.handle("mc:skin-library-delete", async (_, { id }) => {
  const index = await readSkinLibraryIndex();
  const next = index.filter((e) => e.id !== id);
  await fs.writeFile(SKIN_LIBRARY_INDEX, JSON.stringify(next, null, 2));
  await fs.unlink(path.join(SKIN_LIBRARY_DIR, `${id}.png`)).catch(() => {});
  return { success: true };
});

// Fetches an arbitrary texture URL (skin/cape) server-side and hands it back as
// base64 so the renderer can build a data: URL. Textures.minecraft.net doesn't
// send CORS headers, so loading it directly into a WebGL texture from the
// renderer would fail — CORS is a browser-only restriction, so a plain Node
// request here sidesteps it entirely. Restricted to Mojang's own texture host.
const ALLOWED_TEXTURE_HOSTS = new Set(["textures.minecraft.net"]);
ipcMain.handle("mc:fetch-texture-b64", async (_, { url }) => {
  const parsed = new URL(url);
  if (!ALLOWED_TEXTURE_HOSTS.has(parsed.hostname)) {
    throw new Error(`Host de textura no permitido: ${parsed.hostname}`);
  }
  // Mojang's profile API hands back texture URLs with an http: scheme even
  // though the host only serves https; force it since the host is already
  // restricted to the trusted allowlist above.
  parsed.protocol = "https:";
  return new Promise((resolve, reject) => {
    https.get(parsed, { headers: { "User-Agent": "ALaunchi/1.0" } }, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        return reject(new Error(`HTTP ${res.statusCode} descargando textura`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ base64: Buffer.concat(chunks).toString("base64") }));
    }).on("error", reject);
  });
});

ipcMain.handle("fs:read-settings", async () => {
  try { return JSON.parse(await fs.readFile(path.join(APP_DATA_DIR, "settings.json"), "utf8")); }
  catch { return {}; }
});

ipcMain.handle("fs:write-settings", async (_, settings) => {
  await fs.writeFile(path.join(APP_DATA_DIR, "settings.json"), JSON.stringify(settings, null, 2));
  return { success: true };
});

ipcMain.handle("fs:read-auth", async () => {
  try { return JSON.parse(await fs.readFile(path.join(APP_DATA_DIR, "auth.json"), "utf8")); }
  catch { return null; }
});

ipcMain.handle("fs:write-auth", async (_, auth) => {
  await fs.writeFile(path.join(APP_DATA_DIR, "auth.json"), JSON.stringify(auth, null, 2));
  return { success: true };
});

ipcMain.handle("fs:clear-auth", async () => {
  try { await fs.unlink(path.join(APP_DATA_DIR, "auth.json")); } catch {}
  return { success: true };
});

ipcMain.handle("fs:get-data-dir", async () => {
  return { dataDir: APP_DATA_DIR, isCustom: !!getOverriddenDataDir() };
});

ipcMain.handle("fs:choose-data-dir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    title: "Elige la carpeta donde ALaunchi guardará sus datos",
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const chosen = result.filePaths[0];
  await fs.writeFile(LOCATION_FILE, JSON.stringify({ dataDir: chosen }, null, 2));
  return { canceled: false, path: chosen, restartRequired: true };
});

ipcMain.handle("fs:open-data-dir", async () => {
  await shell.openPath(APP_DATA_DIR);
  return { success: true };
});

ipcMain.handle("mc:open-instance-folder", async (_, { modpackId }) => {
  await shell.openPath(path.join(INSTANCES_DIR, modpackId));
  return { success: true };
});

// Content folders scanned for "xray"-named files when a modpack has antiXray
// enabled. Flat scan only — these are single-level folders in every instance.
const ANTIXRAY_CONTENT_DIRS = ["mods", "shaderpacks", "resourcepacks"];

ipcMain.handle("mc:purge-xray-files", async (_, { modpackId }) => {
  const instanceDir = path.join(INSTANCES_DIR, modpackId);
  const deletedFiles = [];
  for (const dir of ANTIXRAY_CONTENT_DIRS) {
    const full = path.join(instanceDir, dir);
    let entries;
    try {
      entries = await fs.readdir(full, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().includes("xray")) continue;
      try {
        await fs.unlink(path.join(full, entry.name));
        deletedFiles.push(`${dir}/${entry.name}`);
      } catch (e) {
        console.warn(`[AntiXray] No se pudo borrar ${dir}/${entry.name}:`, e.message);
      }
    }
  }
  return { deletedFiles };
});

// .emotecraft files are a custom binary container (name/author/keyframe data,
// then a PNG thumbnail tacked on at the end) — the keyframe layout isn't
// documented, but the PNG is trivially found by its magic bytes regardless,
// so we can pull a preview thumbnail without decoding the animation itself.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

ipcMain.handle("mc:list-emotes", async (_, { modpackId }) => {
  const emotesDir = path.join(INSTANCES_DIR, modpackId, "emotes");
  let entries;
  try {
    entries = await fs.readdir(emotesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".emotecraft")) continue;
    let thumbnailBase64 = null;
    try {
      const buf = await fs.readFile(path.join(emotesDir, entry.name));
      const idx = buf.indexOf(PNG_MAGIC);
      if (idx !== -1) thumbnailBase64 = buf.subarray(idx).toString("base64");
    } catch (e) {
      console.warn(`[Emotes] No se pudo leer ${entry.name}:`, e.message);
    }
    results.push({
      fileName: entry.name,
      displayName: entry.name.replace(/\.emotecraft$/i, "").trim(),
      thumbnailBase64,
    });
  }
  return results;
});

ipcMain.handle("github:fetch-modpacks", async (_, { repoUrl }) => {
  try {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) throw new Error("Invalid GitHub URL");
    const [, owner, repo] = match;
    return await fetchJson(`https://raw.githubusercontent.com/${owner}/${repo}/main/modpacks.json`);
  } catch (e) {
    throw new Error("Could not load modpacks from GitHub: " + e.message);
  }
});

ipcMain.handle("github:create-release", async () => {
  return { success: true };
});
