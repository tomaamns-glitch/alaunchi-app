import { normUuid } from "@/lib/playtime";

/**
 * The group's moderator: the only account that edits the mod library and sees
 * player reports. By Minecraft uuid — the same id Firebase Auth knows them by
 * (uid), which is what actually enforces it: database.rules.json (modLibrary)
 * and functions/src/reports.ts (MODERATOR_UIDS). This copy only decides what
 * the app shows. Keep the three in sync.
 */
export const MODERATOR_UUID = "83c37634-cdea-4f40-8dd7-6c32ba6eb07d";

export function isModerator(uuid: string | null | undefined): boolean {
  return !!uuid && normUuid(uuid) === normUuid(MODERATOR_UUID);
}
