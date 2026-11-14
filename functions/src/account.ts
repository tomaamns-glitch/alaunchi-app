import { getAuth } from "firebase-admin/auth";
import { getDatabase, type DataSnapshot } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

/**
 * "Borrar mis datos" (Ajustes → Privacidad). Erases everything ALaunchi keeps
 * on its servers about the caller (Firebase Auth uid = Minecraft uuid), then
 * the Firebase Auth user itself. It has to run here (Admin SDK): the database
 * rules rightly don't let a client touch the other side of a friendship, a
 * chat index entry in someone else's node, and so on.
 *
 * Deleted: profile, status/activity, nickname, presence in every instance,
 * friends/requests (both sides), private conversations (whole: both
 * participants' messages and both index entries), the caller's messages in
 * group chats, invites, instance access/grants, ownership records, blocks the
 * caller made, report counters, and banners/logos in Storage (banners/{uid}/).
 *
 * Kept on purpose (moderation, so deleting your data can't be used to dodge
 * it): reports (reports/), bans from an instance (modpackBans/) and blocks
 * OTHER players made against the caller (blocks/{other}/{uid} + blockedBy/{uid}).
 * Shared files in content-objects/ are keyed by hash, not by person, and may be
 * in other people's messages — not attributable, not deleted.
 *
 * Whole top-level nodes are read to find the caller's entries: fine for a
 * private group's database; revisit with indexes if it ever grows a lot.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONFIRM_WORD = "BORRAR";

/** Children of `node` (one level down) that hold an entry keyed by `uid`. */
function parentsHolding(snap: DataSnapshot, uid: string): string[] {
  const out: string[] = [];
  snap.forEach((child) => {
    if (child.hasChild(uid)) out.push(child.key!);
    return false;
  });
  return out;
}

export const deleteMyData = onCall({ memory: "512MiB", timeoutSeconds: 120, invoker: "public" }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Inicia sesión en ALaunchi para hacer esto.");
  if (!UUID_RE.test(uid)) throw new HttpsError("permission-denied", "Cuenta no válida.");
  if ((req.data as { confirm?: unknown } | null)?.confirm !== CONFIRM_WORD) {
    throw new HttpsError("invalid-argument", "Falta la confirmación.");
  }

  const db = getDatabase();
  const read = (path: string) => db.ref(path).get();
  const [presence, grants, owners, blockedBy, chatIndex, friendReqs, sentReqs, friends, modpackInvites, invites, groupChats] =
    await Promise.all([
      read("presence"),
      read("modpackGrants"),
      read("instanceOwners"),
      read("blockedBy"),
      read("chatIndex"),
      read("friendRequests"),
      read("sentFriendRequests"),
      read("friends"),
      read("modpackInvites"),
      read("invites"),
      read("groupChats"),
    ]);

  const paths = new Set<string>();
  const del = (p: string) => paths.add(p);

  // Own nodes.
  for (const root of ["users", "userActivity", "nicknames", "profiles", "userAccess", "chatIndex", "friendRequests", "sentFriendRequests", "friends", "invites", "blocks", "reportCounts"]) {
    del(`${root}/${uid}`);
  }

  // The caller's entry inside other nodes.
  for (const id of parentsHolding(presence, uid)) del(`presence/${id}/${uid}`);
  for (const key of parentsHolding(grants, uid)) del(`modpackGrants/${key}/${uid}`);
  for (const key of parentsHolding(owners, uid)) del(`instanceOwners/${key}/${uid}`);
  for (const key of parentsHolding(modpackInvites, uid)) del(`modpackInvites/${key}/${uid}`);
  for (const other of parentsHolding(friendReqs, uid)) del(`friendRequests/${other}/${uid}`);
  for (const other of parentsHolding(sentReqs, uid)) del(`sentFriendRequests/${other}/${uid}`);
  for (const other of parentsHolding(friends, uid)) del(`friends/${other}/${uid}`);
  // Mirrors of blocks the caller made (blockedBy/{blocked}/{caller}).
  for (const other of parentsHolding(blockedBy, uid)) del(`blockedBy/${other}/${uid}`);

  // Invites the caller sent to others (they carry the caller's name).
  invites.forEach((toUser) => {
    toUser.forEach((inv) => {
      if (inv.child("fromUuid").val() === uid) del(`invites/${toUser.key}/${inv.key}`);
      return false;
    });
    return false;
  });

  // Private conversations: every one with an index entry on either side.
  const partners = new Set<string>();
  chatIndex.child(uid).forEach((c) => {
    partners.add(c.key!);
    return false;
  });
  for (const other of parentsHolding(chatIndex, uid)) partners.add(other);
  for (const other of partners) {
    if (!UUID_RE.test(other)) continue;
    del(`chats/${[uid, other].sort().join("_")}`);
    del(`chatIndex/${other}/${uid}`);
  }

  // Group chats: only the caller's own messages.
  groupChats.forEach((group) => {
    group.child("messages").forEach((m) => {
      if (m.child("senderUuid").val() === uid) del(`groupChats/${group.key}/messages/${m.key}`);
      return false;
    });
    return false;
  });

  // Apply in chunks (one multi-path update each; null = delete).
  const all = Array.from(paths);
  const CHUNK = 400;
  for (let i = 0; i < all.length; i += CHUNK) {
    const updates: Record<string, null> = {};
    for (const p of all.slice(i, i + CHUNK)) updates[p] = null;
    await db.ref().update(updates);
  }

  // Banners and instance logos uploaded by the caller.
  try {
    await getStorage().bucket().deleteFiles({ prefix: `banners/${uid}/` });
  } catch (e) {
    logger.warn("[deleteMyData] No se pudieron borrar los banners", { uid, error: String(e) });
  }

  // Last: the Firebase Auth user (the app signs out right after).
  try {
    await getAuth().deleteUser(uid);
  } catch (e) {
    logger.warn("[deleteMyData] No se pudo borrar el usuario de Auth", { uid, error: String(e) });
  }

  logger.info("[deleteMyData] Datos borrados", { uid, paths: all.length });
  return { deleted: all.length };
});
