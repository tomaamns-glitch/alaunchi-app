import { create } from "zustand";
import { toast } from "sonner";
import { subscribeMyInvites, clearInvite, type Invite } from "@/services/invites";
import { BannedFromInstanceError } from "@/services/access-codes";
import { joinWithCode } from "@/lib/join-instance";
import { notifyUser } from "@/lib/notify";
import { useModpacks } from "@/hooks/use-modpacks";
import { useAuth } from "@/hooks/use-auth";

// Invitations received (services/invites.ts). They show up as a bubble next
// to the chat heads until answered — or until the player closes that bubble
// without answering, which only removes it from the bar: the invitation stays
// pending under Cuenta → Instancias online. Which ones were closed is per
// account and per device (localStorage), keyed by when the invitation was
// sent, so being invited again brings the bubble back.

const hiddenKey = (uuid: string) => `alaunchi_hidden_invites:${uuid}`;

function loadHidden(uuid: string): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(hiddenKey(uuid)) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

interface InvitesState {
  myUuid: string | null;
  invites: Record<string, Invite>;
  /** key → sentAt of the invitation that was closed from the bar. */
  hidden: Record<string, number>;
  /** Invitation whose card is open over the bar. */
  openKey: string | null;
  busyKey: string | null;
  init: (uuid: string) => void;
  open: (key: string) => void;
  minimize: () => void;
  /** Closes the card AND removes the bubble — still pending in Instancias online. */
  dismissFromBar: (key: string) => void;
  accept: (key: string) => Promise<void>;
  reject: (key: string) => Promise<void>;
}

let unsubscribe: (() => void) | null = null;

export const useInvites = create<InvitesState>((set, get) => ({
  myUuid: null,
  invites: {},
  hidden: {},
  openKey: null,
  busyKey: null,

  init: (uuid) => {
    if (get().myUuid === uuid) return;
    unsubscribe?.();
    set({ myUuid: uuid, invites: {}, hidden: loadHidden(uuid), openKey: null });
    let first = true;
    unsubscribe = subscribeMyInvites(uuid, (invites) => {
      const before = get().invites;
      if (!first) {
        for (const inv of Object.values(invites)) {
          const prev = before[inv.key];
          if (!prev || prev.sentAt !== inv.sentAt) {
            notifyUser({
              title: "Invitación a una instancia",
              body: `${inv.fromUsername} te ha invitado a ${inv.modpackName}`,
              iconUuid: inv.fromUuid,
            }).catch(() => {});
          }
        }
      }
      first = false;
      const openKey = get().openKey;
      set({ invites, openKey: openKey && invites[openKey] ? openKey : null });
    });
  },

  open: (key) => set({ openKey: key }),
  minimize: () => set({ openKey: null }),

  dismissFromBar: (key) => {
    const { myUuid, invites, hidden } = get();
    const inv = invites[key];
    if (!myUuid || !inv) return;
    const next = { ...hidden, [key]: inv.sentAt || Date.now() };
    localStorage.setItem(hiddenKey(myUuid), JSON.stringify(next));
    set({ hidden: next, openKey: get().openKey === key ? null : get().openKey });
  },

  accept: async (key) => {
    const { myUuid, invites } = get();
    const inv = invites[key];
    const username = useAuth.getState().username;
    if (!myUuid || !inv || !username) return;
    set({ busyKey: key });
    try {
      const access = await joinWithCode(inv.code, myUuid, username);
      await clearInvite(key, myUuid);
      if (!access) {
        toast.error("Esta invitación ya no es válida (el código de la instancia cambió). Pide que te inviten otra vez.");
        return;
      }
      toast.success(`Te has unido a ${inv.modpackName}.`);
      useModpacks.getState().loadModpacks();
    } catch (e: any) {
      if (e instanceof BannedFromInstanceError) await clearInvite(key, myUuid).catch(() => {});
      toast.error(e?.message || "No se pudo aceptar la invitación.");
    } finally {
      set({ busyKey: null });
    }
  },

  reject: async (key) => {
    const { myUuid } = get();
    if (!myUuid) return;
    set({ busyKey: key });
    try {
      await clearInvite(key, myUuid);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo rechazar la invitación.");
    } finally {
      set({ busyKey: null });
    }
  },
}));

/** Invitations that still have a bubble in the bar (not closed from it), oldest first. */
export function useBarInvites(): Invite[] {
  const invites = useInvites((s) => s.invites);
  const hidden = useInvites((s) => s.hidden);
  return Object.values(invites)
    .filter((inv) => !(hidden[inv.key] && hidden[inv.key] >= (inv.sentAt || 0)))
    .sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
}
