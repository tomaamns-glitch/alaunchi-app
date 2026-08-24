import { useEffect, useState } from "react";
import { getUuidForUsername, getSkinUrlForUuid, fetchTextureAsDataUrl, renderHeadIcon } from "@/services/skin";

interface ShowcaseSkinState {
  loading: boolean;
  error: string | null;
  headUrl: string | null;
  fullDataUrl: string | null;
  variant: "slim" | "classic";
}

const LOADING: ShowcaseSkinState = { loading: true, error: null, headUrl: null, fullDataUrl: null, variant: "classic" };

/** Resolves a showcase entry's live skin by username — Mojang username lookup,
 *  then the same official session-server + texture-proxy path used elsewhere,
 *  no third-party mirror and no need for that player to be signed into the app. */
export function useShowcaseSkin(username: string): ShowcaseSkinState {
  const [state, setState] = useState<ShowcaseSkinState>(LOADING);

  useEffect(() => {
    let cancelled = false;
    setState(LOADING);

    (async () => {
      const uuid = await getUuidForUsername(username);
      if (!uuid) throw new Error("Jugador no encontrado.");
      const resolved = await getSkinUrlForUuid(uuid);
      if (!resolved) throw new Error("Sin skin equipada.");
      const fullDataUrl = await fetchTextureAsDataUrl(resolved.skinUrl);
      const headUrl = await renderHeadIcon(fullDataUrl, 48);
      if (cancelled) return;
      setState({ loading: false, error: null, headUrl, fullDataUrl, variant: resolved.variant === "SLIM" ? "slim" : "classic" });
    })().catch((e) => {
      if (!cancelled) setState({ loading: false, error: e?.message || "Error", headUrl: null, fullDataUrl: null, variant: "classic" });
    });

    return () => { cancelled = true; };
  }, [username]);

  return state;
}
