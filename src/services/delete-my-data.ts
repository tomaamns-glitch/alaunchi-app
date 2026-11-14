import { httpsCallable } from "firebase/functions";
import { ref, onDisconnect } from "firebase/database";
import { functions, rtdb } from "@/lib/firebase";
import { ensureFirebaseSession, endFirebaseSession, firebaseUid } from "@/services/firebase-session";
import { useAuth } from "@/hooks/use-auth";
import { normUuid } from "@/lib/playtime";

/** What the user has to type to confirm (also checked by the function). */
export const DELETE_CONFIRM_WORD = "BORRAR";

/**
 * "Borrar mis datos" (Ajustes → Mi cuenta). The deletion itself runs in the
 * Cloud Function deleteMyData (functions/src/account.ts — what it erases and
 * what it keeps is listed there). Here: make sure nothing writes our status
 * back afterwards, call it, then sign out and forget this account's local
 * per-user preferences. Instances, the personal library and settings on this
 * PC are not "our servers' data" and stay.
 */
export async function deleteMyData(): Promise<void> {
  const { uuid } = useAuth.getState();
  if (!uuid) throw new Error("No has iniciado sesión.");

  await ensureFirebaseSession();
  const uid = firebaseUid();
  if (!uid || normUuid(uid) !== normUuid(uuid)) {
    throw new Error("No se pudo verificar tu cuenta con el servidor. Cierra y vuelve a abrir ALaunchi e inténtalo de nuevo.");
  }

  // The presence/activity onDisconnect writes would recreate "offline" nodes
  // the moment the connection drops: cancel every one queued by this client.
  await onDisconnect(ref(rtdb)).cancel().catch(() => {});

  try {
    await httpsCallable(functions, "deleteMyData")({ confirm: DELETE_CONFIRM_WORD });
  } catch (e: any) {
    throw new Error(e?.message || "No se pudieron borrar tus datos. Inténtalo de nuevo.");
  }

  clearLocalUserData(uuid);
  await endFirebaseSession();
  await useAuth.getState().logout();
}

/** localStorage keys tied to this account (`…:<uuid>`, `…_<uuid>`). */
function clearLocalUserData(uuid: string) {
  const dashed = uuid.toLowerCase();
  const plain = dashed.replace(/-/g, "");
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.toLowerCase().includes(dashed) || k.toLowerCase().includes(plain))) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
