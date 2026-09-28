import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";

// DEV ONLY — a lab for previewing a third-party avatar-decoration pack (read
// straight from its zip by main.js, see "dev:deco-list") on your own head, in
// the app's rounded-square avatar style. Only rendered under `electron:dev`;
// nothing here is saved to the profile or bundled. It's for judging styles
// before designing our own frames, not for shipping those images.

const eAPI = (window as any).electronAPI;
const S = 144; // resolution the adapted frames are computed at

// Circle -> square remap: each output pixel on a square ring of "radius" r
// samples the source circle of the same radius at the same angle, so anything
// drawn around a round avatar ends up drawn around a square one.
const SQUARE_MAP = (() => {
  const map = new Int32Array(S * S);
  const c = S / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5 - c) / c;
      const v = (y + 0.5 - c) / c;
      const r = Math.max(Math.abs(u), Math.abs(v));
      const a = Math.atan2(v, u);
      const sx = Math.floor(c + r * c * Math.cos(a));
      const sy = Math.floor(c + r * c * Math.sin(a));
      map[y * S + x] = sx < 0 || sy < 0 || sx >= S || sy >= S ? -1 : sy * S + sx;
    }
  }
  return map;
})();

interface Frame {
  image: ImageData;
  end: number;
}

const bytesCache = new Map<string, Promise<ArrayBuffer | null>>();
function getDecoBytes(name: string): Promise<ArrayBuffer | null> {
  let p = bytesCache.get(name);
  if (!p) {
    p = (async () => {
      if (!eAPI?.devPackGet) throw new Error("reinicia la app en dev (falta devPackGet)");
      const b64: string | null = await eAPI.devPackGet("deco", name);
      if (!b64) return null;
      return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)).buffer;
    })();
    // don't cache failures — a restart of the app should be able to fix them
    p.catch(() => bytesCache.delete(name));
    bytesCache.set(name, p);
  }
  return p;
}

/** Decodes every APNG frame (WebCodecs) and optionally warps it to the
 *  rounded-square layout; played back on a canvas with the real durations. */
async function decodeFrames(bytes: ArrayBuffer, square: boolean): Promise<Frame[]> {
  const scratch = document.createElement("canvas");
  scratch.width = scratch.height = S;
  const g = scratch.getContext("2d", { willReadFrequently: true })!;
  const dec = new (window as any).ImageDecoder({ data: bytes, type: "image/png" });
  await dec.tracks.ready;
  const count = dec.tracks.selectedTrack?.frameCount || 1;
  const frames: Frame[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const { image } = await dec.decode({ frameIndex: i });
    g.clearRect(0, 0, S, S);
    g.drawImage(image, 0, 0, S, S);
    total += (image.duration || 50000) / 1000;
    image.close();
    const src = g.getImageData(0, 0, S, S);
    if (!square) {
      frames.push({ image: src, end: total });
      continue;
    }
    const out = new ImageData(S, S);
    for (let k = 0; k < S * S; k++) {
      const j = SQUARE_MAP[k];
      if (j < 0) continue;
      out.data[k * 4] = src.data[j * 4];
      out.data[k * 4 + 1] = src.data[j * 4 + 1];
      out.data[k * 4 + 2] = src.data[j * 4 + 2];
      out.data[k * 4 + 3] = src.data[j * 4 + 3];
    }
    frames.push({ image: out, end: total });
  }
  dec.close();
  return frames;
}

function DecoratedHead({
  name,
  headUrl,
  size,
  square,
}: {
  name: string;
  headUrl: string | null;
  size: number;
  square: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const bytes = await getDecoBytes(name);
      if (cancelled) return;
      if (!bytes) throw new Error("no se pudo leer del zip");
      const frames = await decodeFrames(bytes, square);
      if (cancelled || !frames.length) return;
      setLoading(false);
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const loop = frames[frames.length - 1].end;
      const t0 = performance.now();
      let shown = -1;
      const tick = (now: number) => {
        const t = (now - t0) % loop;
        let i = 0;
        while (i < frames.length - 1 && frames[i].end <= t) i++;
        if (i !== shown) {
          ctx.putImageData(frames[i].image, 0, 0);
          shown = i;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })().catch((e) => {
      if (cancelled) return;
      console.error("[dev-deco-lab]", e);
      setLoading(false);
      setError(String(e?.message || e));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [name, square]);

  // Same proportions Discord uses: the decoration is ~1.2x the avatar.
  const inset = size * (0.2 / 2.4);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`absolute overflow-hidden bg-accent/20 ${square ? "rounded-[14%]" : "rounded-full"}`}
        style={{ inset }}
      >
        {headUrl && <img src={headUrl} alt="" className="h-full w-full" style={{ imageRendering: "pixelated" }} />}
      </div>
      <canvas ref={canvasRef} width={S} height={S} className="absolute inset-0 h-full w-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && size >= 100 && (
        <div className="absolute inset-0 flex items-center justify-center p-1 text-center text-[10px] text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

export function DevDecoLab({ uuid }: { uuid: string }) {
  const headUrl = usePlayerHeadUrl(uuid);
  const [names, setNames] = useState<string[] | null | undefined>(undefined);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [square, setSquare] = useState(true);

  useEffect(() => {
    if (!eAPI?.devPackList) {
      setListError("Reinicia la app en dev: esta ventana no tiene las funciones de pruebas cargadas.");
      setNames(null);
      return;
    }
    eAPI
      .devPackList("deco")
      .then(setNames)
      .catch((e: any) => {
        setListError(String(e?.message || e));
        setNames(null);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (names ?? []).filter((n) => n.toLowerCase().includes(q)).slice(0, 60);
  }, [names, query]);

  const label = (n: string) => n.replace(/^.*\//, "").replace(/\.png$/i, "").replace(/_/g, " ");

  if (names === undefined) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }
  if (names === null) {
    return (
      <p className="text-xs text-muted-foreground">
        {listError ??
          "No se encontró el pack de pruebas (Descargas/avatar_decoration.zip, o la variable ALAUNCHI_DECO_ZIP)."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-2 w-[150px] shrink-0">
          {selected ? (
            <>
              <DecoratedHead key={`${selected}-${square}-96`} name={selected} headUrl={headUrl} size={120} square={square} />
              <div className="flex items-end gap-3">
                <DecoratedHead key={`${selected}-${square}-48`} name={selected} headUrl={headUrl} size={48} square={square} />
                <DecoratedHead key={`${selected}-${square}-30`} name={selected} headUrl={headUrl} size={30} square={square} />
              </div>
              <span className="text-[11px] text-center text-gray-300">{label(selected)}</span>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground text-center py-10">Elige una para verla sobre tu cabeza.</p>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar entre ${names.length}...`}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setSquare((v) => !v)}
              className="h-8 px-2.5 rounded-md border border-white/10 bg-white/5 text-xs hover:bg-white/10"
            >
              {square ? "Rectangular" : "Redonda"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 max-h-[210px] overflow-y-auto pr-1">
            {filtered.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSelected(n)}
                className={`truncate rounded px-2 py-1 text-left text-[11px] transition-colors ${
                  selected === n ? "bg-accent/20 text-accent" : "text-gray-300 hover:bg-white/5"
                }`}
              >
                {label(n)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-amber-400/80">
        Solo en desarrollo: no se guarda en tu perfil ni se incluye en la app. Sirve para comparar estilos.
      </p>
    </div>
  );
}
