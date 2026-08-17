import { useAuth } from "@/hooks/use-auth";
import { isAdminEmail } from "@/lib/admin";

/**
 * Admin UI is visible to whitelisted emails, and always in dev builds (the
 * dev login bypass has no real Microsoft account to check against).
 */
export function useIsAdmin(): boolean {
  const email = useAuth((s) => s.email);
  return import.meta.env.DEV || isAdminEmail(email);
}
