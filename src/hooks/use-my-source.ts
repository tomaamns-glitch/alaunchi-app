import { create } from "zustand";
import { verifyCreatorRepo, type RepoVerification } from "@/services/github";
import { MY_SOURCE_KEYS, sameRepo } from "@/lib/sources";
import { SECRET_KEYS, getSecret, removeSecret, setSecret, whenSecureStoreReady } from "@/lib/secure-store";

/**
 * The creator's own repo setup (Ajustes → Mi repositorio). Being a "creator"
 * — seeing ADMIN, publishing — means having saved a repo whose admin token
 * passed verifyCreatorRepo; the verified repo URL is remembered so the check
 * doesn't have to hit GitHub on every start.
 *
 * Repo/flags persisted in localStorage under MY_SOURCE_KEYS, tokens in the
 * encrypted secure store — lib/sources.ts reads both directly (non-React
 * callers: catalog loading, installs).
 */

export interface MySourceConfig {
  repoUrl: string;
  adminToken: string;
  isPrivate: boolean;
  /** Only meaningful when isPrivate — handed to players with an access code. */
  readToken: string;
}

interface MySourceState extends MySourceConfig {
  /** Repo URL that last passed verification, or null. */
  verifiedRepoUrl: string | null;
  /** Checks against GitHub and, only if it passes, saves. Throws a readable
   *  error otherwise (nothing is saved). */
  save: (config: MySourceConfig) => Promise<RepoVerification>;
  /** Forgets the repo entirely — no longer a creator. */
  clear: () => void;
}

function read(): Omit<MySourceState, "save" | "clear"> {
  const ls = (k: string) => localStorage.getItem(k) || "";
  return {
    repoUrl: ls(MY_SOURCE_KEYS.repo),
    adminToken: getSecret(SECRET_KEYS.githubAdminToken) || "",
    isPrivate: ls(MY_SOURCE_KEYS.isPrivate) === "1",
    readToken: getSecret(SECRET_KEYS.githubReadToken) || "",
    verifiedRepoUrl: ls(MY_SOURCE_KEYS.verified) || null,
  };
}

export const useMySource = create<MySourceState>((set) => ({
  ...read(),

  save: async (config) => {
    const result = await verifyCreatorRepo(
      config.repoUrl.trim(),
      config.adminToken.trim(),
      config.isPrivate ? config.readToken.trim() : undefined
    );
    // GitHub has the last word on private/public — a mismatch would leave
    // players unable to download (public reads of a private repo 404).
    const isPrivate = result.isPrivate;
    const readToken = isPrivate ? config.readToken.trim() : "";
    localStorage.setItem(MY_SOURCE_KEYS.repo, result.repoUrl);
    setSecret(SECRET_KEYS.githubAdminToken, config.adminToken.trim());
    localStorage.setItem(MY_SOURCE_KEYS.isPrivate, isPrivate ? "1" : "0");
    if (readToken) setSecret(SECRET_KEYS.githubReadToken, readToken);
    else removeSecret(SECRET_KEYS.githubReadToken);
    localStorage.setItem(MY_SOURCE_KEYS.verified, result.repoUrl);
    set({
      repoUrl: result.repoUrl,
      adminToken: config.adminToken.trim(),
      isPrivate,
      readToken,
      verifiedRepoUrl: result.repoUrl,
    });
    return result;
  },

  clear: () => {
    Object.values(MY_SOURCE_KEYS).forEach((k) => localStorage.removeItem(k));
    removeSecret(SECRET_KEYS.githubAdminToken);
    removeSecret(SECRET_KEYS.githubReadToken);
    set({ repoUrl: "", adminToken: "", isPrivate: false, readToken: "", verifiedRepoUrl: null });
  },
}));

// This module can be evaluated (and the store above created) before main.tsx
// finishes loading the secure store — pick the tokens up once it has.
whenSecureStoreReady().then(() => useMySource.setState(read()));

/** Whether this user is a creator: has a repo whose setup passed verification. */
export function useIsCreator(): boolean {
  return useMySource((s) => !!s.verifiedRepoUrl && !!s.adminToken && sameRepo(s.verifiedRepoUrl, s.repoUrl));
}
