import { useEffect, useState } from "react";
import { get, ref } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { getGrantedSources, repoKey } from "@/lib/sources";
import { getCodeCreatorUuid } from "@/services/access-codes";

// Who's behind each granted repo, by name — so the UI can say "Jugador"
// instead of a GitHub "owner/repo". Worked out from the access codes you
// redeemed for that repo (each code records its creator's uuid) and the user
// directory (users/{uuid}). Cached per repo for the session.
const cache = new Map<string, Promise<string | null>>();

async function creatorFromCodes(codes: string[]): Promise<string | null> {
  for (const code of codes) {
    const uuid = await getCodeCreatorUuid(code).catch(() => null);
    if (!uuid) continue;
    const name = (await get(ref(rtdb, `users/${uuid}/username`)).catch(() => null))?.val();
    if (typeof name === "string" && name) return name;
  }
  return null;
}

/** Creator name of every granted repo, keyed by repoKey (missing = unknown). */
export function useRepoCreators(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    for (const source of getGrantedSources()) {
      const key = repoKey(source.repoUrl);
      if (!key || !source.codes?.length) continue;
      let p = cache.get(key);
      if (!p) {
        p = creatorFromCodes(source.codes);
        cache.set(key, p);
      }
      p.then((name) => {
        if (!cancelled && name) setNames((prev) => (prev[key] === name ? prev : { ...prev, [key]: name }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);
  return names;
}
