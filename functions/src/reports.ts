import { getDatabase, ServerValue } from "firebase-admin/database";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

/**
 * Player reports. Anyone signed in (Firebase Auth, uid = Minecraft uuid) can
 * report another player; only the moderators can read them. Reports live in
 * reports/{id}, a path the database rules don't open to clients at all — these
 * functions (Admin SDK) are the only way in or out.
 *
 * The conversation's last messages are attached HERE, read from the database,
 * not sent by the reporter, so they can't be made up.
 */

/** Minecraft uuids (Firebase uids) of the moderators — see src/lib/moderation.ts. */
const MODERATOR_UIDS = new Set(["83c37634-cdea-4f40-8dd7-6c32ba6eb07d"]);

const REASONS = new Set(["harassment", "inappropriate", "spam", "cheating", "other"]);
const STATUSES = new Set(["open", "resolved", "dismissed"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;
const MAX_REPORTS_PER_DAY = 10;
const CONTEXT_MESSAGES = 20;

function requireUid(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Inicia sesión en ALaunchi para hacer esto.");
  return uid;
}

function requireModerator(req: CallableRequest): string {
  const uid = requireUid(req);
  if (!MODERATOR_UIDS.has(uid)) throw new HttpsError("permission-denied", "Solo los moderadores pueden ver los reportes.");
  return uid;
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export const submitReport = onCall({ memory: "256MiB", timeoutSeconds: 20, invoker: "public" }, async (req) => {
  const uid = requireUid(req);
  const { targetUuid, targetName, reporterName, reason, comment, source } = (req.data ?? {}) as Record<string, unknown>;
  if (typeof targetUuid !== "string" || !UUID_RE.test(targetUuid)) throw new HttpsError("invalid-argument", "Jugador no válido.");
  if (targetUuid === uid) throw new HttpsError("invalid-argument", "No puedes reportarte a ti mismo.");
  if (typeof reason !== "string" || !REASONS.has(reason)) throw new HttpsError("invalid-argument", "Elige un motivo.");

  const db = getDatabase();
  // A few reports a day per player, so the panel can't be flooded.
  const day = new Date().toISOString().slice(0, 10);
  const counter = await db.ref(`reportCounts/${uid}/${day}`).transaction((n) => (typeof n === "number" ? n + 1 : 1));
  if ((counter.snapshot.val() as number) > MAX_REPORTS_PER_DAY) {
    throw new HttpsError("resource-exhausted", "Has enviado demasiados reportes hoy. Inténtalo mañana.");
  }

  const conversationId = [uid, targetUuid].sort().join("_");
  const snap = await db.ref(`chats/${conversationId}/messages`).orderByKey().limitToLast(CONTEXT_MESSAGES).get();
  const messages: Record<string, unknown>[] = [];
  snap.forEach((child) => {
    const m = child.val() ?? {};
    messages.push({
      senderUuid: clip(m.senderUuid, 40),
      text: m.deleted ? "(mensaje eliminado)" : clip(m.text, 2000),
      ...(m.content?.displayName ? { attachment: clip(m.content.displayName, 200) } : {}),
      ...(m.server?.name ? { attachment: `Server: ${clip(m.server.name, 100)}` } : {}),
      ...(m.instance?.name ? { attachment: `Instancia: ${clip(m.instance.name, 100)}` } : {}),
      timestamp: typeof m.timestamp === "number" ? m.timestamp : 0,
    });
    return false;
  });

  const ref = db.ref("reports").push();
  await ref.set({
    reporterUuid: uid,
    reporterName: typeof reporterName === "string" && NAME_RE.test(reporterName) ? reporterName : "",
    targetUuid,
    targetName: typeof targetName === "string" && NAME_RE.test(targetName) ? targetName : "",
    reason,
    comment: clip(comment, 1000),
    source: source === "profile" ? "profile" : "chat",
    messages,
    status: "open",
    createdAt: ServerValue.TIMESTAMP,
  });
  return { id: ref.key };
});

export const listReports = onCall({ memory: "256MiB", timeoutSeconds: 20, invoker: "public" }, async (req) => {
  requireModerator(req);
  const snap = await getDatabase().ref("reports").orderByChild("createdAt").limitToLast(300).get();
  const reports: Record<string, unknown>[] = [];
  snap.forEach((child) => {
    reports.push({ id: child.key, ...child.val() });
    return false;
  });
  return { reports: reports.reverse() };
});

export const setReportStatus = onCall({ memory: "256MiB", timeoutSeconds: 20, invoker: "public" }, async (req) => {
  const moderator = requireModerator(req);
  const { id, status, note } = (req.data ?? {}) as Record<string, unknown>;
  if (typeof id !== "string" || !/^[-_A-Za-z0-9]{1,40}$/.test(id)) throw new HttpsError("invalid-argument", "Reporte no válido.");
  if (typeof status !== "string" || !STATUSES.has(status)) throw new HttpsError("invalid-argument", "Estado no válido.");
  const ref = getDatabase().ref(`reports/${id}`);
  if (!(await ref.child("createdAt").get()).exists()) throw new HttpsError("not-found", "Ese reporte ya no existe.");
  await ref.update({
    status,
    note: clip(note, 1000),
    reviewedBy: moderator,
    reviewedAt: ServerValue.TIMESTAMP,
  });
  return { ok: true };
});
