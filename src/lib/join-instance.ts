import { redeemAccessCode, normalizeCode, type RedeemedAccess } from "@/services/access-codes";
import { fetchSnapshot, cacheSnapshot } from "@/services/github";
import { addGrantedSource, getReadToken } from "@/lib/sources";

/**
 * Joins the online instance a code points to — shared by "Canjear código" and
 * accepting an invitation (which carries the instance's code). Records the
 * grant (throws BannedFromInstanceError if the player is blocked), remembers
 * the repo as a source — with the code, so a rotated read token can be
 * recovered later — and warms the manifest cache. null = unknown code.
 * The caller reloads the catalog.
 */
export async function joinWithCode(code: string, uuid: string, username: string): Promise<RedeemedAccess | null> {
  const access = await redeemAccessCode(code, uuid, username);
  if (!access) return null;
  // The code carries the repo (and its read token, if private) — adding it
  // as a source is what makes the catalog read that repo at all.
  addGrantedSource({ repoUrl: access.repoUrl, readToken: access.readToken, codes: [normalizeCode(code)] });
  // Fire-and-forget — by the time the player finds the pack in the carousel
  // and hits "Instalar", the manifest is (usually) already in the cache.
  const { modpackId, repoUrl } = access;
  fetchSnapshot(repoUrl, modpackId, getReadToken(repoUrl))
    .then((manifest) => manifest && cacheSnapshot(modpackId, manifest))
    .catch(() => {});
  return access;
}
