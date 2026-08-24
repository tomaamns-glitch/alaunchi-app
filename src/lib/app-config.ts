/**
 * Baked-in defaults so regular users never have to open Ajustes.
 *
 * The repo name is public info either way. The reader token is a
 * fine-grained PAT scoped to Contents: Read-only on that one repo — leaking
 * it only lets someone download modpacks, so it's safe to ship in every
 * build (unlike a real write-capable token, which must stay user-supplied
 * in Ajustes and never get baked in).
 */
export const DEFAULT_GITHUB_REPO = "https://github.com/tomaamns-glitch/Modpacks";

export function getGithubRepo(): string {
  return localStorage.getItem("githubRepo") || DEFAULT_GITHUB_REPO;
}

/**
 * Token used for read-only modpack operations (browsing, downloading,
 * checking for updates). Prefers the user's own token from Ajustes when set
 * (admins need one anyway, for publishing) — otherwise falls back to the
 * embedded read-only token so regular players need zero setup.
 */
export function getModpacksToken(): string {
  return localStorage.getItem("githubToken") || import.meta.env.VITE_MODPACKS_READER_TOKEN || "";
}

/**
 * Crash reports go to their own dedicated repo via their own embedded
 * token (Issues: Read & write only, no Contents access) — fully decoupled
 * from the modpacks repo/token in Ajustes, so a leaked crash-report token
 * can only spam issues in a throwaway repo, and every user gets crash
 * reporting for free without configuring anything.
 */
export function getCrashReportConfig(): { repoUrl: string; token: string } {
  return {
    repoUrl: import.meta.env.VITE_CRASH_REPORT_REPO || "",
    token: import.meta.env.VITE_CRASH_REPORT_TOKEN || "",
  };
}
