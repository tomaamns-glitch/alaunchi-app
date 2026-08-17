/**
 * Baked-in defaults so regular users never have to open Ajustes.
 * Only the modpacks repo can be defaulted here — it's read-only info (repo name),
 * not a secret. Never bake in a GitHub token: anything shipped in the app can be
 * extracted, and a token would grant write access to whoever pulls it out.
 * Set this once you've created your modpacks repo; leave empty until then.
 */
export const DEFAULT_GITHUB_REPO = "";

export function getGithubRepo(): string {
  return localStorage.getItem("githubRepo") || DEFAULT_GITHUB_REPO;
}
