// There's no modpacks repo or reader token baked in anymore: each creator
// configures their own repo in Ajustes and everyone else reaches one through
// an access code — see lib/sources.ts.

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
