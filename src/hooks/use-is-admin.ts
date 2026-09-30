import { useAuth } from "@/hooks/use-auth";
import { useIsCreator } from "@/hooks/use-my-source";
import { isAdminEmail } from "@/lib/admin";

/**
 * ADMIN (button, publishing pages) = being a creator: anyone who configured
 * their own repo in Ajustes and passed its verification. Not tied to any
 * email anymore — every creator administers only their own repo.
 */
export function useIsAdmin(): boolean {
  return useIsCreator();
}

/**
 * The app's own private config (Azure client id…) — whitelisted emails only,
 * and always in dev builds (the dev login bypass has no real Microsoft account
 * to check against). Unrelated to being a creator.
 */
export function useIsAppOwner(): boolean {
  const email = useAuth((s) => s.email);
  return import.meta.env.DEV || isAdminEmail(email);
}
