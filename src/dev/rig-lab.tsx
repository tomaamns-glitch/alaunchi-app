// DEV ONLY (rig-lab.html): the 3D character viewer outside Electron, to look at
// the player rig + animations (lib/player-rig.ts, lib/player-animations.ts),
// classic and slim, with a button per clip. ?skin=<url> uses a real skin (must
// allow CORS); otherwise a drawn test skin whose faces make wrong UVs or
// orientation obvious.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { SkinViewerAnimated } from "@/components/skin-viewer-animated";
import { PLAYER_CLIP_NAMES } from "@/lib/player-animations";

const CLIP_LABELS: Record<string, string> = {
  idle_sub_1: "Mirar alrededor",
  idle_sub_2: "Estirarse",
  idle_sub_3: "Cambiar el peso",
  idle_sub_4: "Rascarse la cabeza",
  idle_sub_5: "Mirarse la mano",
  idle_sub_6: "Impaciencia",
  idle_sub_7: "Estirar el cuello",
  idle_sub_8: "Patear una piedrita",
  idle_sub_9: "Balancearse",
  interact: "Saludar (clic)",
};

function px(g: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

/** A box's whole texture region in one colour, then its front face in another. */
function box(g: CanvasRenderingContext2D, u: number, v: number, w: number, h: number, d: number, side: string, front: string, back: string, top: string) {
  px(g, side, u, v + d, 2 * d + 2 * w, h);
  px(g, front, u + d, v + d, w, h);
  px(g, back, u + 2 * d + w, v + d, w, h);
  px(g, top, u + d, v, w, d);
  px(g, top, u + d + w, v, w, d);
}

function drawTestSkin(): string {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const skin = "#e0b088";
  const hair = "#4a2f1b";
  // Head: hair on the sides/back/top, a face on the front.
  box(g, 0, 0, 8, 8, 8, hair, skin, hair, hair);
  px(g, skin, 0, 11, 8, 5); // cheeks on the right side
  px(g, skin, 16, 11, 8, 5); // …and the left
  px(g, hair, 8, 8, 8, 2); // fringe
  px(g, "#ffffff", 9, 12, 2, 1);
  px(g, "#2f5fd0", 10, 12, 1, 1);
  px(g, "#ffffff", 13, 12, 2, 1);
  px(g, "#2f5fd0", 13, 12, 1, 1);
  px(g, "#9a5a44", 11, 14, 2, 1); // mouth
  // Body: green shirt, an orange stripe on the front, darker back.
  box(g, 16, 16, 8, 12, 4, "#2f7d4a", "#2f9a55", "#1f5c37", "#2f7d4a");
  px(g, "#f08a24", 20, 23, 8, 2);
  // Arms: sleeves up top, skin below. Right arm (40,16), left arm (32,48).
  for (const [u, v] of [[40, 16], [32, 48]] as const) {
    box(g, u, v, 4, 12, 4, skin, skin, skin, "#2f7d4a");
    px(g, "#2f9a55", u, v + 4, 16, 4);
  }
  // Legs: trousers, dark shoes. Right leg (0,16), left leg (16,48).
  for (const [u, v] of [[0, 16], [16, 48]] as const) {
    box(g, u, v, 4, 12, 4, "#34406b", "#3d4c80", "#2a3457", "#34406b");
    px(g, "#2a2a2a", u, v + 13, 16, 3);
  }
  return c.toDataURL();
}

function drawTestCape(): string {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const g = c.getContext("2d")!;
  px(g, "#7a1d1d", 0, 0, 22, 17);
  px(g, "#b02a2a", 1, 1, 10, 16); // outer face
  px(g, "#f2c94c", 4, 5, 4, 6); // emblem
  return c.toDataURL();
}

function Lab() {
  const params = new URLSearchParams(location.search);
  const [skin] = useState(() => params.get("skin") || drawTestSkin());
  const [cape] = useState(() => (params.has("nocape") ? null : drawTestCape()));
  return (
    <div style={{ padding: 16 }}>
      <p>Clic en un personaje: saludo · arrastrar: girar · gesto al azar cada 6–10 s</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {PLAYER_CLIP_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => (window as unknown as { __playClip?: (n: string) => void }).__playClip?.(name)}
            style={{ padding: "6px 10px", background: "#2b332f", color: "#ddd", border: "1px solid #3f4a44", borderRadius: 6, cursor: "pointer" }}
          >
            {CLIP_LABELS[name] ?? name}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <SkinViewerAnimated skinUrl={skin} capeUrl={cape} variant="classic" width={190} height={254} />
        <SkinViewerAnimated skinUrl={skin} capeUrl={cape} variant="slim" width={190} height={254} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Lab />);
