/** Emails allowed to see admin/private-config UI (case-insensitive). */
const ADMIN_WHITELIST = ["thereal_adriian@hotmail.com"];

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_WHITELIST.includes(email.trim().toLowerCase());
}
