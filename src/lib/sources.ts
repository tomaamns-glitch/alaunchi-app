import { parseRepo } from "@/services/github";
import { SECRET_KEYS, getSecret, setSecret } from "@/lib/secure-store";

/**
 * "Sources" = the GitHub repos online instances come from. There's no default
 * repo baked into the app: every creator configures their own in Ajustes
 * ("my source"), and everyone else only reaches a repo through an access code
 * that points at it ("granted sources").
 *
 * This module is the ONLY place that knows which repo + token to use — every
 * install/update/changelog call goes through getReadToken(pack.repoUrl)
 * instead of assuming one global catalog.
 */

export interface GrantedSource {
  /** Canonical "https://github.com/owner/repo". */
  repoUrl: string;
  /** Only for private repos — the creator's read-only token, handed over
   *  through the access code. Absent = public repo, read anonymously. */
  readToken?: string;
  /** Access codes redeemed for this repo — kept so a rotated read token can be
   *  fetched again through them (access-codes.ts' refreshAccess). */
  codes?: string[];
}

/** localStorage keys of the creator's own repo setup (written by
 *  hooks/use-my-source.ts). The tokens themselves aren't here — they live in
 *  the encrypted secure store (SECRET_KEYS.githubAdminToken/githubReadToken). */
export const MY_SOURCE_KEYS = {
  repo: "githubRepo",
  isPrivate: "githubRepoPrivate",
  verified: "githubRepoVerified",
} as const;

/** Granted sources carry private repos' read tokens, so the whole map is a secret. */
const GRANTED_KEY = SECRET_KEYS.grantedSources;

/** "owner/repo", lowercased — how two spellings of the same repo URL compare. */
export function repoKey(repoUrl: string): string | null {
  const parsed = parseRepo(repoUrl);
  return parsed ? `${parsed.owner}/${parsed.repo}`.toLowerCase() : null;
}

export function canonicalRepoUrl(repoUrl: string): string | null {
  const parsed = parseRepo(repoUrl);
  return parsed ? `https://github.com/${parsed.owner}/${parsed.repo}` : null;
}

export function sameRepo(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ka = repoKey(a);
  return !!ka && ka === repoKey(b);
}

/** The repo this user publishes to (Ajustes), with its admin (write) token —
 *  null unless one is configured AND passed verification, i.e. they're a creator. */
export function getMySource(): { repoUrl: string; adminToken: string; isPrivate: boolean; readToken?: string } | null {
  const repoUrl = canonicalRepoUrl(localStorage.getItem(MY_SOURCE_KEYS.repo) || "");
  const verified = localStorage.getItem(MY_SOURCE_KEYS.verified) || "";
  const adminToken = getSecret(SECRET_KEYS.githubAdminToken) || "";
  if (!repoUrl || !adminToken || !sameRepo(repoUrl, verified)) return null;
  const isPrivate = localStorage.getItem(MY_SOURCE_KEYS.isPrivate) === "1";
  const readToken = (isPrivate && getSecret(SECRET_KEYS.githubReadToken)) || undefined;
  return { repoUrl, adminToken, isPrivate, readToken };
}

function readGranted(): Record<string, GrantedSource> {
  try {
    const raw = getSecret(GRANTED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Repos someone gave this user access to, keyed by repoKey. */
export function getGrantedSources(): GrantedSource[] {
  return Object.values(readGranted());
}

/** Remembers a repo reached through an access code (and its read token, if
 *  private). Re-adding the same repo refreshes the token and adds the code. */
export function addGrantedSource(source: GrantedSource): void {
  const url = canonicalRepoUrl(source.repoUrl);
  const key = url && repoKey(url);
  if (!url || !key) throw new Error("Repositorio no válido.");
  const all = readGranted();
  const codes = Array.from(new Set([...(all[key]?.codes ?? []), ...(source.codes ?? [])]));
  all[key] = {
    repoUrl: url,
    ...(source.readToken ? { readToken: source.readToken } : {}),
    ...(codes.length ? { codes } : {}),
  };
  setSecret(GRANTED_KEY, JSON.stringify(all));
}

export function getGrantedSource(repoUrl: string): GrantedSource | null {
  const key = repoKey(repoUrl);
  return (key && readGranted()[key]) || null;
}

export function removeGrantedSource(repoUrl: string): void {
  const key = repoKey(repoUrl);
  if (!key) return;
  const all = readGranted();
  delete all[key];
  setSecret(GRANTED_KEY, JSON.stringify(all));
}

/** Modpack ids end up as local instance folder names, and nothing stops two
 *  creators picking the same one ("survival") — a short random suffix, added
 *  once when the instance is created, keeps them from colliding on a player's
 *  machine. */
export function uniqueModpackId(base: string): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${base.replace(/-+$/, "")}-${suffix}`;
}

/** Token for READING a repo: your admin token for your own repo, the handed-
 *  over read token for a private granted one, undefined for a public one
 *  (fetched anonymously, no rate-limited API). */
export function getReadToken(repoUrl: string | undefined): string | undefined {
  if (!repoUrl) return undefined;
  const mine = getMySource();
  if (mine && sameRepo(mine.repoUrl, repoUrl)) return mine.adminToken || undefined;
  const key = repoKey(repoUrl);
  return (key && readGranted()[key]?.readToken) || undefined;
}
