import type { Modpack } from "@/services/github";

/** Which context a floating panel (chat, presence) is currently framed in —
 *  "general" covers everything not tied to one specific published modpack
 *  (the Hub/local instances, friends, profiles); "carousel" is a specific
 *  catalog instance (the home carousel's current selection). Shared by
 *  ChatWindow/ChatContactRail and PresenceButton so a page only has to build
 *  this value once and hand it to both. */
export type ChatMode = { type: "general" } | { type: "carousel"; pack: Modpack };
