// Most notification sounds are synthesized on the fly with the Web Audio API —
// no assets to source/license, keeps "personalizar el sonido" to a simple stored
// preset id instead of a file picker. A few real clips (public/sounds/) are
// mixed into the same preset list for the ones the user actually supplied.
// Independent of the OS notification's own sound (always requested silent — see
// use-chat-heads.ts / presence-button.tsx), so this is the only thing played.

export type NotificationSoundId = "chime" | "ding" | "pop" | "amethyst" | "villager" | "none";

export const NOTIFICATION_SOUNDS: { id: NotificationSoundId; label: string }[] = [
  { id: "chime", label: "Campanilla" },
  { id: "ding", label: "Ding" },
  { id: "pop", label: "Pop" },
  { id: "amethyst", label: "Amatista" },
  { id: "villager", label: "Aldeano" },
  { id: "none", label: "Silencio" },
];

// Presets backed by a bundled clip instead of a synthesized tone.
const SOUND_FILES: Partial<Record<NotificationSoundId, string>> = {
  amethyst: "/sounds/notif-amethyst.mp3",
  villager: "/sounds/notif-villager.mp3",
};

const STORAGE_KEY = "alaunchi_notification_sound";
const DEFAULT_SOUND: NotificationSoundId = "chime";

export function getNotificationSound(): NotificationSoundId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (NOTIFICATION_SOUNDS.some((s) => s.id === stored) ? stored : DEFAULT_SOUND) as NotificationSoundId;
}

export function setNotificationSound(id: NotificationSoundId): void {
  localStorage.setItem(STORAGE_KEY, id);
}

// Reused across plays instead of a fresh AudioContext each time — browsers cap
// how many can exist, and autoplay policies suspend new ones until a user
// gesture anyway, so keeping one around (and resuming it) is more reliable.
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  if (sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
  return sharedCtx;
}

function tone(ctx: AudioContext, freq: number, startAt: number, duration: number, type: OscillatorType, peakGain: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Ramp up/down instead of jumping straight to peakGain/0 — an instant step
  // in a sine wave is an audible click.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** Plays the given (or, by default, the user's saved) notification sound. */
export function playNotificationSound(id: NotificationSoundId = getNotificationSound()): void {
  if (id === "none") return;
  const file = SOUND_FILES[id];
  if (file) {
    const audio = new Audio(file);
    audio.volume = 0.6;
    audio.play().catch(() => {});
    return;
  }
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (id === "chime") {
    tone(ctx, 880, now, 0.22, "sine", 0.22);
    tone(ctx, 1318.5, now + 0.09, 0.28, "sine", 0.18);
  } else if (id === "ding") {
    tone(ctx, 1318.5, now, 0.5, "triangle", 0.2);
  } else if (id === "pop") {
    tone(ctx, 520, now, 0.09, "sine", 0.28);
  }
}
