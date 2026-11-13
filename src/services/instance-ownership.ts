import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { ensureRepoOwnerFile } from "@/services/github";
import { ensureFirebaseSession, firebaseUid } from "@/services/firebase-session";
import { grantKey } from "@/services/access-codes";

/**
 * Records in Firebase that this player is the creator of some instances of
 * their repo (instanceOwners/{grantKey}/{uuid}), which the access-code
 * functions — and later the database rules — check. Writes the repo's
 * alaunchi-owner.json first if their uuid isn't in it (github.ts), then asks
 * the claimInstances function to verify it. Throws on failure: callers that
 * need it (creating a code) say so to the user.
 */
const claimed = new Set<string>();

export async function claimMyInstances(opts: {
  repoUrl: string;
  adminToken: string;
  readToken?: string;
  uuid: string;
  modpackIds: string[];
}): Promise<void> {
  const pending = opts.modpackIds.filter((id) => !claimed.has(grantKey(opts.repoUrl, id)));
  if (pending.length === 0) return;
  await ensureFirebaseSession();
  if (!firebaseUid()) throw new Error("No se pudo iniciar sesión en el servidor de ALaunchi. Inténtalo de nuevo en un momento.");
  await ensureRepoOwnerFile(opts.repoUrl, opts.adminToken, opts.uuid);
  const claim = httpsCallable<{ repoUrl: string; readToken?: string; modpackIds: string[] }, { claimed: number }>(
    functions,
    "claimInstances"
  );
  await claim({ repoUrl: opts.repoUrl, ...(opts.readToken ? { readToken: opts.readToken } : {}), modpackIds: pending });
  for (const id of pending) claimed.add(grantKey(opts.repoUrl, id));
}
