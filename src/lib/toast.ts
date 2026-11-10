import { toast as sonner, type ExternalToast } from "sonner";

// The corner messages (bottom right). Only the important ones are shown:
//   · errors and warnings — always;
//   · anything carrying an action button ("Deshacer"…) — always;
//   · `notify.success / info / (msg)` — the important confirmations: long
//     installs that finished, something sent to another player, side effects
//     the player didn't ask for, the reason an action did nothing…
//   · plain `toast.success / info / (msg)` — the routine ones the screen
//     already shows ("guardado", "eliminado", "copiado"): not shown.
// So a new routine confirmation needs nothing; an important one uses `notify`.

type Msg = Parameters<typeof sonner.success>[0];

function routine(kind: "success" | "info") {
  return (message: Msg, data?: ExternalToast) => (data?.action ? sonner[kind](message, data) : "");
}

/** Shown always (use it for the important confirmations). */
export const notify = sonner;

/** Drop-in replacement for sonner's `toast`: routine confirmations are muted. */
export const toast = Object.assign(
  (message: Msg, data?: ExternalToast) => (data?.action ? sonner(message, data) : ""),
  sonner,
  {
    success: routine("success"),
    info: routine("info"),
    message: routine("info"),
  }
);
