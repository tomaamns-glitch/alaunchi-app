import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Library, Loader2, Package, Search } from "lucide-react";
import { toast, notify } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModLibraryDialog } from "@/components/mod-library-dialog";
import { LoaderIcon } from "@/components/loader-icon";
import { installServerModFromUrl, joinRemotePath, listServerDirectory, readServerTextFile } from "@/services/servers";
import { listVersions, searchProjects, type ModrinthSearchHit, type ModrinthUpdate } from "@/services/modrinth";
import { LIBRARY_LOADER_LABELS, subscribeLibraryMods, type LibraryBuild, type LibraryLoader, type LibraryMod } from "@/services/mod-library";

// Mods straight onto a server (FTP/SFTP): the same Modrinth search and group
// library as the instance manager, but the destination is the server's mods/
// folder. A server has no instance meta, so the Minecraft version and the
// loader are read from its files (and can be corrected by hand, remembered).

const LOADERS: LibraryLoader[] = ["fabric", "forge", "neoforge"];
const storageKey = (serverId: string) => `alaunchi_server_target:${serverId}`;

interface Target {
  mc: string;
  loader: LibraryLoader | "";
}

async function dirNames(id: string, path: string): Promise<{ name: string; type: "file" | "dir" }[]> {
  try {
    return await listServerDirectory(id, path);
  } catch {
    return [];
  }
}

/** Best guess of what the server runs, from its files. Empty fields = unknown. */
async function detectTarget(id: string, root: string): Promise<Target> {
  const base = root.replace(/\/+$/, "");
  const at = (p: string) => `${base}/${p}`;
  const top = await dirNames(id, root || "/");
  const names = new Set(top.map((e) => e.name));

  let loader: LibraryLoader | "" = "";
  if (names.has("libraries")) {
    const net = (await dirNames(id, at("libraries/net"))).map((e) => e.name);
    if (net.includes("neoforged")) loader = "neoforge";
    else if (net.includes("minecraftforge")) loader = "forge";
    else if (net.includes("fabricmc")) loader = "fabric";
  }
  if (!loader && (names.has(".fabric") || names.has("fabric-server-launch.jar") || [...names].some((n) => /^fabric-server/i.test(n)))) {
    loader = "fabric";
  }

  let mc = "";
  const vanilla = await dirNames(id, at("libraries/net/minecraft/server"));
  const dir = vanilla.find((e) => e.type === "dir" && /^\d+\.\d+/.test(e.name));
  if (dir) mc = dir.name.match(/^(\d+\.\d+(?:\.\d+)?)/)?.[1] ?? "";
  if (!mc && names.has("logs")) {
    try {
      const log = await readServerTextFile(id, at("logs/latest.log"));
      mc = log.match(/Starting minecraft server version (\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? "";
    } catch {
      /* no readable log */
    }
  }
  return { mc, loader };
}

function loadStored(id: string): Target | null {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(id)) || "null");
    return v && typeof v.mc === "string" ? v : null;
  } catch {
    return null;
  }
}

export function ServerModsDialog({
  open,
  onOpenChange,
  serverId,
  serverName,
  rootPath,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  serverName: string;
  rootPath: string;
  /** Something was installed — the file list may have changed. */
  onChanged: () => void;
}) {
  const modsDir = joinRemotePath(rootPath || "/", "mods");
  const [target, setTarget] = useState<Target>({ mc: "", loader: "" });
  const [detecting, setDetecting] = useState(false);
  const [remoteMods, setRemoteMods] = useState<string[]>([]);
  const [libraryMods, setLibraryMods] = useState<LibraryMod[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ModrinthSearchHit[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const searchSeq = useRef(0);

  const ready = !!target.mc && !!target.loader;

  const refreshRemote = useCallback(async () => {
    const list = await dirNames(serverId, modsDir);
    setRemoteMods(list.filter((e) => e.type === "file" && /\.jar$/i.test(e.name)).map((e) => e.name));
  }, [serverId, modsDir]);

  // Version + loader: remembered choice first, else read from the server.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits(null);
    setDone(new Set());
    refreshRemote();
    const stored = loadStored(serverId);
    if (stored) {
      setTarget({ mc: stored.mc, loader: stored.loader });
      return;
    }
    let cancelled = false;
    setDetecting(true);
    detectTarget(serverId, rootPath || "/")
      .then((t) => !cancelled && setTarget(t))
      .finally(() => !cancelled && setDetecting(false));
    return () => {
      cancelled = true;
    };
  }, [open, serverId, rootPath, refreshRemote]);

  useEffect(() => {
    if (!open) return;
    return subscribeLibraryMods(setLibraryMods, () => setLibraryMods([]));
  }, [open]);

  const updateTarget = (patch: Partial<Target>) => {
    setTarget((t) => {
      const next = { ...t, ...patch };
      try {
        localStorage.setItem(storageKey(serverId), JSON.stringify(next));
      } catch {
        /* not remembered */
      }
      return next;
    });
  };

  // Search (empty query = what's popular), debounced.
  useEffect(() => {
    if (!open || !ready) return;
    const seq = ++searchSeq.current;
    setHits(null);
    const timer = window.setTimeout(() => {
      searchProjects("mods", query.trim(), target.loader, target.mc, 0, 20, query.trim() ? "relevance" : "downloads", null, true).then(
        (list) => seq === searchSeq.current && setHits(list)
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [open, ready, query, target.loader, target.mc]);

  /** Latest release compatible with the server (or the newest of any kind). */
  const pickVersion = async (projectId: string): Promise<ModrinthUpdate | null> => {
    const versions = await listVersions(projectId, target.loader, target.mc, "mods");
    return versions.find((v) => v.versionType === "release") ?? versions[0] ?? null;
  };

  const installModrinth = async (hit: ModrinthSearchHit) => {
    setBusy((s) => new Set(s).add(hit.projectId));
    try {
      const have = new Set(remoteMods);
      const queue: string[] = [hit.projectId];
      const seen = new Set<string>();
      const installed: string[] = [];
      while (queue.length && seen.size < 12) {
        const pid = queue.shift()!;
        if (seen.has(pid)) continue;
        seen.add(pid);
        const version = await pickVersion(pid);
        if (!version) {
          if (pid === hit.projectId) throw new Error(`${hit.title} no tiene versión para ${target.mc} (${target.loader}).`);
          continue; // a dependency we can't match: the server will say so when it starts
        }
        if (!have.has(version.filename)) {
          await installServerModFromUrl(serverId, modsDir, { fileName: version.filename, url: version.url, sha1: version.sha1 });
          have.add(version.filename);
          installed.push(version.filename);
        }
        for (const d of version.dependencies) {
          if (d.dependencyType === "required" && d.projectId && !seen.has(d.projectId)) queue.push(d.projectId);
        }
      }
      setDone((s) => new Set(s).add(hit.projectId));
      await refreshRemote();
      onChanged();
      notify.success(
        installed.length > 1
          ? `${hit.title} instalado, con ${installed.length - 1} dependencia${installed.length === 2 ? "" : "s"}.`
          : installed.length === 1
            ? `${hit.title} instalado.`
            : `${hit.title} ya estaba en el servidor.`,
        { description: installed.length ? "Reinicia el servidor para cargarlo." : undefined }
      );
    } catch (e: any) {
      toast.error(e?.message || `No se pudo instalar ${hit.title}.`);
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(hit.projectId);
        return next;
      });
    }
  };

  // Library builds already on the server (matched by file name — we don't hash remote files).
  const libraryInstalled = useMemo(() => {
    const out: { path: string; sha1: string; mandatory: boolean }[] = [];
    const names = new Set(remoteMods);
    for (const mod of libraryMods) {
      for (const b of Object.values(mod.builds)) {
        if (names.has(b.fileName)) out.push({ path: joinRemotePath(modsDir, b.fileName), sha1: b.sha1, mandatory: false });
      }
    }
    return out;
  }, [libraryMods, remoteMods, modsDir]);

  const installLibrary = async (_mod: LibraryMod, build: LibraryBuild, replacePath?: string) => {
    await installServerModFromUrl(
      serverId,
      modsDir,
      { fileName: build.fileName, url: build.downloadUrl, sha1: build.sha1 },
      replacePath
    );
    await refreshRemote();
    onChanged();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl h-[80vh] flex flex-col gap-4 border-transparent bg-gray-500/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:rounded-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-accent" /> Mods de {serverName}
            </DialogTitle>
            <DialogDescription>
              Se instalan en <code className="text-xs">{modsDir}</code>. {remoteMods.length} mod{remoteMods.length === 1 ? "" : "s"} en el servidor.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Servidor en</span>
            <Input
              value={target.mc}
              onChange={(e) => updateTarget({ mc: e.target.value.trim() })}
              placeholder="1.20.1"
              className="h-8 w-24 text-xs"
              aria-label="Versión de Minecraft del servidor"
            />
            <Select value={target.loader || undefined} onValueChange={(v) => updateTarget({ loader: v as LibraryLoader })}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="Modloader del servidor">
                <SelectValue placeholder="Modloader" />
              </SelectTrigger>
              <SelectContent>
                {LOADERS.map((l) => (
                  <SelectItem key={l} value={l}>
                    <span className="inline-flex items-center gap-1.5">
                      <LoaderIcon loader={l} className="h-3.5 w-3.5" />
                      {LIBRARY_LOADER_LABELS[l]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {detecting && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Detectando…
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 border-white/10 text-xs"
              disabled={!ready}
              onClick={() => setLibraryOpen(true)}
            >
              <Library className="mr-1.5 h-3.5 w-3.5" /> Biblioteca
            </Button>
          </div>

          {!ready ? (
            <p className="flex-1 text-center text-sm text-muted-foreground pt-10">
              {detecting
                ? "Mirando qué versión y modloader usa el servidor…"
                : "No se pudo saber qué versión y modloader usa el servidor. Indícalos arriba para buscar mods compatibles."}
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar mods en Modrinth (solo los que funcionan en servidor)"
                  className="h-9 pl-8 text-sm"
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-1.5">
                {hits === null ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : hits.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">Nada compatible con {target.mc} y {LIBRARY_LOADER_LABELS[target.loader as LibraryLoader]}.</p>
                ) : (
                  hits.map((hit) => {
                    const isBusy = busy.has(hit.projectId);
                    const isDone = done.has(hit.projectId);
                    return (
                      <div key={hit.projectId} className="flex items-center gap-3 rounded-md bg-white/[0.05] p-2.5">
                        {hit.iconUrl ? (
                          <img src={hit.iconUrl} alt="" className="h-10 w-10 shrink-0 rounded bg-black/30 object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-black/30">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{hit.title}</p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{hit.description}</p>
                        </div>
                        {isDone ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-accent">
                            <Check className="h-3.5 w-3.5" /> Instalado
                          </span>
                        ) : (
                          <Button size="sm" className="h-8 shrink-0 text-xs" disabled={isBusy} onClick={() => installModrinth(hit)}>
                            {isBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                            Instalar
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {ready && (
        <ModLibraryDialog
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          pack={{ id: serverId, name: serverName, minecraftVersion: target.mc, loaderType: target.loader }}
          installedMods={libraryInstalled}
          onInstall={installLibrary}
          subtitle={`Mods del grupo para el servidor ${serverName}`}
        />
      )}
    </>
  );
}
