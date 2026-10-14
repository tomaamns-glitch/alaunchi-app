// ─── DISCORD RICH PRESENCE ───────────────────────────────────────────────────
// Minimal client for Discord's local RPC (the named pipe the desktop app opens),
// enough to set/clear the "Jugando a …" activity on the player's profile. No
// dependency: the protocol is just [op:int32 LE][len:int32 LE][JSON] frames.
//
// Everything here is best-effort: Discord closed, not installed, or a bad client
// id must never surface as an error — we just retry quietly every so often.

const net = require("net");
const path = require("path");

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const RETRY_MS = 20000;
// Discord rate-limits SET_ACTIVITY (5 per 20 s); run-state changes come in bursts
// (installing → launching → starting → running), so only the last one is sent.
const DEBOUNCE_MS = 1500;

function pipePath(i) {
  if (process.platform === "win32") return `\\\\?\\pipe\\discord-ipc-${i}`;
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || "/tmp";
  return path.join(base, `discord-ipc-${i}`);
}

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data), "utf8");
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
}

function connectPipe(i = 0) {
  return new Promise((resolve, reject) => {
    if (i >= 10) return reject(new Error("Discord no está abierto"));
    const sock = net.createConnection(pipePath(i));
    sock.once("connect", () => {
      sock.removeAllListeners("error");
      resolve(sock);
    });
    sock.once("error", () => {
      sock.destroy();
      connectPipe(i + 1).then(resolve, reject);
    });
  });
}

function createDiscordPresence() {
  let enabled = true;
  let desired = null; // { clientId, activity } | null
  let sock = null;
  let sockClientId = null;
  let ready = false;
  let connecting = false;
  let retryTimer = null;
  let debounceTimer = null;
  let lastSent = undefined; // JSON of the last activity actually sent

  function closeSocket() {
    ready = false;
    sockClientId = null;
    lastSent = undefined;
    if (sock) {
      try { sock.end(encode(OP.CLOSE, {})); } catch {}
      sock.destroy();
      sock = null;
    }
  }

  function scheduleRetry() {
    if (retryTimer || !enabled || !desired) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      sync();
    }, RETRY_MS);
  }

  function send(op, data) {
    if (!sock) return;
    try { sock.write(encode(op, data)); } catch {}
  }

  function pushActivity() {
    if (!ready || !sock) return;
    const activity = desired?.activity || null;
    const json = JSON.stringify(activity);
    if (json === lastSent) return;
    lastSent = json;
    send(OP.FRAME, {
      cmd: "SET_ACTIVITY",
      args: { pid: process.pid, activity },
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
  }

  async function connect(clientId) {
    connecting = true;
    let s;
    try {
      s = await connectPipe();
    } catch {
      connecting = false;
      scheduleRetry();
      return;
    }
    connecting = false;
    // Settings/activity changed while we were connecting.
    if (!enabled || !desired || desired.clientId !== clientId) {
      s.destroy();
      sync();
      return;
    }
    sock = s;
    sockClientId = clientId;
    let buf = Buffer.alloc(0);
    s.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 8) {
        const op = buf.readInt32LE(0);
        const len = buf.readInt32LE(4);
        if (buf.length < 8 + len) break;
        let msg = null;
        try { msg = JSON.parse(buf.subarray(8, 8 + len).toString("utf8")); } catch {}
        buf = buf.subarray(8 + len);
        if (op === OP.PING) send(OP.PONG, msg);
        else if (op === OP.CLOSE) {
          console.warn("[discord] Discord cerró la conexión:", msg?.message || msg?.code || "");
          s.destroy();
        } else if (op === OP.FRAME && msg?.evt === "READY") {
          ready = true;
          pushActivity();
        } else if (op === OP.FRAME && msg?.evt === "ERROR") {
          console.warn("[discord]", msg?.data?.message || msg);
        }
      }
    });
    s.on("error", () => {});
    s.on("close", () => {
      if (sock !== s) return;
      sock = null;
      ready = false;
      sockClientId = null;
      lastSent = undefined;
      scheduleRetry();
    });
    send(OP.HANDSHAKE, { v: 1, client_id: clientId });
  }

  function sync() {
    if (!enabled || !desired?.clientId) {
      closeSocket();
      return;
    }
    if (sock && sockClientId !== desired.clientId) closeSocket();
    if (sock) {
      pushActivity();
      return;
    }
    if (!connecting && !retryTimer) connect(desired.clientId);
  }

  return {
    /** `null` clears the presence (and closes the pipe). */
    setActivity(next) {
      desired = next;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sync, DEBOUNCE_MS);
    },
    setEnabled(on) {
      if (enabled === on) return;
      enabled = on;
      if (!on) clearTimeout(retryTimer), (retryTimer = null);
      sync();
    },
    destroy() {
      enabled = false;
      clearTimeout(debounceTimer);
      clearTimeout(retryTimer);
      closeSocket();
    },
  };
}

module.exports = { createDiscordPresence };
