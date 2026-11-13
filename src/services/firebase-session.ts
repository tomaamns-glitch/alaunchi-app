import { create } from "zustand";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { firebaseAuth, functions } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { normUuid } from "@/lib/playtime";

const eAPI = (window as any).electronAPI;

/**
 * Signs this PC into Firebase as the logged-in Minecraft account (phase 1 of
 * the Firebase Auth migration — the database rules don't require it yet).
 *
 *  1. main.js "mc:session-join": Mojang records that this account joined a
 *     random serverId (what the game does when connecting to a server; the
 *     Minecraft token only goes to Mojang).
 *  2. mintFirebaseToken (functions/): asks Mojang hasJoined and returns a
 *     custom token whose uid is the uuid.
 *  3. signInWithCustomToken. The session is kept by Firebase (IndexedDB, also
 *     shared with the overlay page — same origin) and refreshes itself, so
 *     this only does the round trip when there's no session for this account.
 *
 * The database rules require it (auth.uid), so the app waits for it before
 * mounting its pages and starting its listeners (useFirebaseSession, App.tsx):
 * a listener started before signing in is refused and Firebase never retries
 * it. Never throws; on failure (or after SESSION_WAIT_MS) the app goes on and
 * it is retried on the next login / app start.
 */
let inFlight: Promise<void> | null = null;

/** Never keep the app on its splash longer than this waiting for Mojang/Firebase. */
const SESSION_WAIT_MS = 15_000;

/** For which account the session attempt has finished (signed in or given up). */
export const useFirebaseSession = create<{ readyFor: string | null }>(() => ({ readyFor: null }));

export function ensureFirebaseSession(): Promise<void> {
  if (!inFlight) {
    const uuid = useAuth.getState().uuid;
    const attempt = Promise.race([run(), new Promise<void>((r) => setTimeout(r, SESSION_WAIT_MS))]);
    inFlight = attempt.finally(() => {
      inFlight = null;
      if (uuid && useAuth.getState().uuid === uuid) useFirebaseSession.setState({ readyFor: uuid });
    });
  }
  return inFlight;
}

async function run(): Promise<void> {
  try {
    if (!eAPI?.mcSessionJoin) return;
    // Firebase restores a saved session asynchronously at startup.
    await firebaseAuth.authStateReady();
    const { uuid, username } = useAuth.getState();
    if (!uuid || !username) return;
    if (firebaseAuth.currentUser && normUuid(firebaseAuth.currentUser.uid) === normUuid(uuid)) return;

    const valid = await useAuth.getState().getValidTokenForLaunch();
    if (!valid?.mcToken) return;
    const { serverId } = (await eAPI.mcSessionJoin({ mcToken: valid.mcToken, uuid: valid.uuid })) as { serverId: string };
    const mint = httpsCallable<{ username: string; serverId: string }, { token: string; uuid: string }>(
      functions,
      "mintFirebaseToken"
    );
    const { data } = await mint({ username: valid.username, serverId });
    await signInWithCustomToken(firebaseAuth, data.token);
  } catch (e) {
    console.warn("[firebase-session] No se pudo iniciar sesión en Firebase:", e);
  }
}

/** The Firebase uid (= Minecraft uuid) this PC is signed in as, if any. */
export function firebaseUid(): string | null {
  return firebaseAuth.currentUser?.uid ?? null;
}

/** On logging out of the launcher (or switching account). */
export async function endFirebaseSession(): Promise<void> {
  useFirebaseSession.setState({ readyFor: null });
  try {
    await signOut(firebaseAuth);
  } catch {
    /* nothing to undo */
  }
}
