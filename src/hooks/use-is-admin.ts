import { useIsCreator } from "@/hooks/use-my-source";

/**
 * ADMIN (button, publishing pages) = being a creator: anyone who configured
 * their own repo in Ajustes and passed its verification. Not tied to any
 * email anymore — every creator administers only their own repo.
 */
export function useIsAdmin(): boolean {
  return useIsCreator();
}
