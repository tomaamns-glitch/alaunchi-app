import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePlayerHeadUrl } from "@/hooks/use-player-head";
import { useDevBannerOverride } from "@/lib/dev-banner-override";

// DEV ONLY — tries a third-party nameplate pack (webm, read from its zip by
// main.js "dev:pack-*") as the profile banner. Nothing is saved or bundled:
// "Probar en mi perfil" only sets an in-memory override (dev-banner-override.ts)
// that the Profile page shows until cleared or the app is closed.

const eAPI = (window as any).electronAPI;

const urlCache = new Map<string, Promise<string>>();
function getNameplateUrl(name: string): Promise<string> {
  let p = urlCache.get(name);
  if (!p) {
    p = (async () => {
      if (!eAPI?.devPackGet) throw new Error("reinicia la app en dev (falta devPackGet)");
      const b64: string | null = await eAPI.devPackGet("nameplate", name);
      if (!b64) throw new Error("no se pudo leer del zip");
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: "video/webm" }));
    })();
    p.catch(() => urlCache.delete(name));
    urlCache.set(name, p);
  }
  return p;
}

const label = (n: string) => n.replace(/^.*\//, "").replace(/\.webm$/i, "").replace(/_/g, " ");

/** Same layers as the Profile page's card: banner, left-to-right fade, content. */
function BannerPreview({ videoUrl, headUrl, username }: { videoUrl: string; headUrl: string | null; username: string }) {
  return (
    <div className="relative h-[120px] rounded-xl border border-white/10 bg-card/40 overflow-hidden">
      <div className="absolute inset-0">
        <video src={videoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/25" />
      </div>
      <div className="relative h-full flex items-center gap-3 px-4">
        <div className="h-14 w-14 rounded-lg border border-white/10 bg-accent/20 overflow-hidden">
          {headUrl && <img src={headUrl} alt="" className="h-full w-full" style={{ imageRendering: "pixelated" }} />}
        </div>
        <div>
          <div className="text-lg font-bold leading-tight">{username}</div>
          <div className="text-xs text-muted-foreground">Así se vería el banner de tu perfil</div>
        </div>
      </div>
    </div>
  );
}

export function DevBannerLab({ uuid, username }: { uuid: string; username: string }) {
  const headUrl = usePlayerHeadUrl(uuid);
  const [names, setNames] = useState<string[] | null | undefined>(undefined);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const override = useDevBannerOverride();

  useEffect(() => {
    if (!eAPI?.devPackList) {
      setListError("Reinicia la app en dev: esta ventana no tiene las funciones de pruebas cargadas.");
      setNames(null);
      return;
    }
    eAPI
      .devPackList("nameplate")
      .then(setNames)
      .catch((e: any) => {
        setListError(String(e?.message || e));
        setNames(null);
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setVideoUrl(null);
    setLoadError(null);
    getNameplateUrl(selected)
      .then((url) => !cancelled && setVideoUrl(url))
      .catch((e) => !cancelled && setLoadError(String(e?.message || e)));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (names ?? []).filter((n) => n.toLowerCase().includes(q));
  }, [names, query]);

  if (names === undefined) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (names === null) {
    return (
      <p className="text-xs text-muted-foreground">
        {listError ?? "No se encontró el pack de nameplates (Descargas/nameplates.zip, o ALAUNCHI_NAMEPLATE_ZIP)."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {selected ? (
        videoUrl ? (
          <BannerPreview videoUrl={videoUrl} headUrl={headUrl} username={username} />
        ) : (
          <div className="h-[120px] rounded-xl border border-white/10 flex items-center justify-center text-xs text-red-400">
            {loadError ?? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        )
      ) : (
        <div className="h-[120px] rounded-xl border border-dashed border-white/10 flex items-center justify-center text-[11px] text-muted-foreground">
          Elige una para verla como banner.
        </div>
      )}

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
        <Button
          size="sm"
          className="h-8"
          disabled={!selected || !videoUrl}
          onClick={() => selected && videoUrl && override.set(selected, videoUrl)}
        >
          Probar en mi perfil
        </Button>
        {override.name && (
          <Button size="sm" variant="outline" className="h-8" onClick={override.clear}>
            Quitar
          </Button>
        )}
      </div>
      {override.name && (
        <p className="text-[11px] text-accent">Probando en tu perfil: {label(override.name)}</p>
      )}

      <div className="grid grid-cols-3 gap-1 max-h-[160px] overflow-y-auto pr-1">
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
      <p className="text-[10px] text-amber-400/80">
        Solo en desarrollo: el banner de prueba no se guarda ni se publica, y desaparece al cerrar la app.
      </p>
    </div>
  );
}
