import { Hint } from "@/components/hint";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Check,
  Download,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  Package,
  Plus,
  Send,
  Smile,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast, notify } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImageLightbox, type LightboxNav } from "@/components/image-lightbox";
import { ShareImageDialog, type ShareableImage } from "@/components/share-image-dialog";
import { useModpacks } from "@/hooks/use-modpacks";
import { useCustomInstances } from "@/hooks/use-custom-instances";
import { downloadInstanceFile, listEmotes, listInstanceFiles, listSchematics } from "@/services/electron";
import { findCompatibleInstances, listAllMyInstances, type CompatibleInstance } from "@/lib/content-compat";
import { identifyLibraryFiles } from "@/services/mod-library";
import type { Modpack } from "@/services/github";
import { GLASS_MENU_LINE } from "@/components/content-context-menu";
import { categoryOf, fileName as baseName, guessTitle, identifyModrinthFiles } from "@/services/modrinth";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  SAVED_CATEGORY_LABELS,
  installSavedContent,
  readGalleryImage,
  removeContent,
  removeFromGallery,
  saveContent,
  showGalleryFile,
  usePersonalLibrary,
  type SavedContent,
  type SavedContentCategory,
} from "@/services/personal-library";

const CATEGORY_ICON: Record<SavedContentCategory, LucideIcon> = {
  mods: Package,
  shaderpacks: Sparkles,
  resourcepacks: ImageIcon,
  emotes: Smile,
  schematics: Box,
};
const CATEGORIES = Object.keys(SAVED_CATEGORY_LABELS) as SavedContentCategory[];

type Tab = "content" | "gallery";

/** Cuenta → Biblioteca: "Contenido" (saved copies of mods/shaders/packs/emotes/
 *  structures, installable into any instance, plus browsing an instance to save
 *  from it) and "Galería" (your screenshots and the ones friends sent). */
export function PersonalLibraryPanel() {
  const [tab, setTab] = useState<Tab>("content");
  // "Guardar" (browse an instance to save content) lives in the header's corner,
  // so its state is here.
  const [browsing, setBrowsing] = useState(false);
  const loaded = usePersonalLibrary((s) => s.loaded);

  useEffect(() => {
    usePersonalLibrary.getState().refresh().catch(() => {});
  }, []);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 p-1 rounded-md bg-white/[0.07] border border-transparent">
          {(["content", "gallery"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setBrowsing(false);
              }}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-semibold transition-colors",
                tab === t ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-white"
              )}
            >
              {t === "content" ? "Contenido" : "Galería"}
            </button>
          ))}
        </div>
        {tab === "content" && !browsing && loaded && (
          <Button size="sm" className="h-7 px-2.5 text-xs shrink-0" onClick={() => setBrowsing(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Guardar
          </Button>
        )}
      </div>
      {!loaded ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : tab === "content" ? (
        <ContentTab browsing={browsing} onCloseBrowsing={() => setBrowsing(false)} />
      ) : (
        <GalleryTab />
      )}
    </div>
  );
}

/** Every instance this player has on this PC (installed online + private). */
function useMyInstances() {
  const modpacks = useModpacks((s) => s.modpacks);
  const pastModpacks = useModpacks((s) => s.pastModpacks);
  const custom = useCustomInstances((s) => s.instances);
  const loadInstances = useCustomInstances((s) => s.loadInstances);
  useEffect(() => {
    if (custom.length === 0) loadInstances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useMemo(
    () => [
      ...custom.map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl })),
      ...[...modpacks, ...pastModpacks].filter((p) => p.installed).map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl })),
    ],
    [modpacks, pastModpacks, custom]
  );
}

function ItemIcon({ iconUrl, category, className = "h-9 w-9" }: { iconUrl: string | null; category: SavedContentCategory; className?: string }) {
  const Icon = CATEGORY_ICON[category];
  return iconUrl ? (
    <img src={iconUrl} alt="" className={cn(className, "rounded object-cover bg-black/30 shrink-0")} />
  ) : (
    <div className={cn(className, "rounded bg-black/30 shrink-0 flex items-center justify-center")}>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function ContentTab({ browsing, onCloseBrowsing }: { browsing: boolean; onCloseBrowsing: () => void }) {
  const content = usePersonalLibrary((s) => s.content);
  const instances = useMyInstances();
  const [filter, setFilter] = useState<SavedContentCategory | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = filter === "all" ? content : content.filter((c) => c.category === filter);

  const install = async (item: SavedContent, inst: { id: string; name: string }) => {
    setBusyId(item.id);
    try {
      await installSavedContent(item.id, inst.id);
      notify.success(`${item.displayName} instalado en ${inst.name}.`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo instalar.");
    } finally {
      setBusyId(null);
    }
  };

  if (browsing) return <InstanceBrowser instances={instances} onClose={onCloseBrowsing} />;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex-1 min-w-0 flex gap-1 overflow-x-auto">
          {(["all", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[11px] border whitespace-nowrap transition-colors",
                filter === c
                  ? "bg-accent text-accent-foreground border-transparent"
                  : "bg-white/[0.07] text-muted-foreground border-transparent hover:bg-white/[0.14]"
              )}
            >
              {c === "all" ? "Todo" : SAVED_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {visible.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 px-4">
            {content.length === 0
              ? 'Aún no has guardado nada. Pulsa "Guardar" para elegir contenido de una de tus instancias.'
              : "No hay nada guardado de este tipo."}
          </p>
        ) : (
          visible.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-white/[0.07] border border-transparent">
              <ItemIcon iconUrl={item.iconUrl} category={item.category} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-100 truncate">{item.displayName}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {SAVED_CATEGORY_LABELS[item.category]}
                  {item.reference && " · referencia"}
                  {item.sourceName && ` · de ${item.sourceName}`}
                </p>
              </div>
              {item.reference ? (
                <ReferenceInstallMenu item={item} />
              ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-7 px-2 text-xs shrink-0" disabled={busyId === item.id}>
                    {busyId === item.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                    Instalar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">Instalar en…</DropdownMenuLabel>
                  {instances.length === 0 ? (
                    <DropdownMenuItem disabled>No tienes instancias</DropdownMenuItem>
                  ) : (
                    instances.map((inst) => (
                      <DropdownMenuItem key={inst.id} onClick={() => install(item, inst)}>
                        {inst.imageUrl ? (
                          <img src={inst.imageUrl} alt="" className="mr-2 h-4 w-4 rounded-sm object-cover" />
                        ) : (
                          <Package className="mr-2 h-4 w-4" />
                        )}
                        <span className="truncate">{inst.name}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              )}
              <Hint label="Quitar de la biblioteca">
                <button
                  type="button"
                  onClick={() => removeContent(item.id).catch(() => toast.error("No se pudo quitar."))}
                  className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-gray-400 hover:text-destructive hover:bg-white/5 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Hint>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** "Instalar" for an item saved as a reference (no file stored): looks up, for
 *  each of your instances, the version of the project that fits its Minecraft
 *  version and loader. Instances with no compatible version are listed apart. */
function ReferenceInstallMenu({ item }: { item: SavedContent }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ compatible: CompatibleInstance[]; incompatible: Modpack[] } | null>(null);

  useEffect(() => {
    if (!open || result || !item.modrinthProjectId) return;
    let cancelled = false;
    (async () => {
      const [mine, compatible] = await Promise.all([
        listAllMyInstances(),
        findCompatibleInstances(item.modrinthProjectId!, item.category),
      ]);
      if (cancelled) return;
      const ok = new Set(compatible.map((c) => c.pack.id));
      setResult({ compatible, incompatible: mine.filter((p) => !ok.has(p.id)) });
    })().catch(() => !cancelled && setResult({ compatible: [], incompatible: [] }));
    return () => {
      cancelled = true;
    };
  }, [open, result, item.modrinthProjectId, item.category]);

  const install = async ({ pack, resolvedVersion: v }: CompatibleInstance) => {
    setBusy(true);
    try {
      await downloadInstanceFile(pack.id, `${item.category}/${v.filename}`, v.url, v.sha1);
      notify.success(`${item.displayName} ${v.versionNumber} instalado en ${pack.name}.`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo instalar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-7 px-2 text-xs shrink-0" disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
          Instalar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={`relative max-h-72 overflow-y-auto ${GLASS_MENU_LINE}`}>
        <DropdownMenuLabel className="text-xs">Instancias compatibles</DropdownMenuLabel>
        {!result ? (
          <DropdownMenuItem disabled>
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Buscando versiones…
          </DropdownMenuItem>
        ) : result.compatible.length === 0 ? (
          <DropdownMenuItem disabled>Ninguna de tus instancias es compatible</DropdownMenuItem>
        ) : (
          result.compatible.map((c) => (
            <DropdownMenuItem key={c.pack.id} onClick={() => install(c)}>
              {c.pack.imageUrl ? (
                <img src={c.pack.imageUrl} alt="" className="mr-2 h-4 w-4 rounded-sm object-cover" />
              ) : (
                <Package className="mr-2 h-4 w-4" />
              )}
              <span className="truncate">{c.pack.name}</span>
              <span className="ml-2 text-[10px] text-muted-foreground shrink-0">{c.resolvedVersion.versionNumber}</span>
            </DropdownMenuItem>
          ))
        )}
        {!!result?.incompatible.length && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">No compatibles</DropdownMenuLabel>
            {result.incompatible.map((p) => (
              <DropdownMenuItem key={p.id} disabled className="text-xs">
                <span className="truncate">{p.name}</span>
                <span className="ml-2 text-[10px] shrink-0">
                  {p.loaderType} {p.minecraftVersion}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface BrowseItem {
  path: string;
  fileName: string;
  displayName: string;
  iconUrl: string | null;
  sha1: string | null;
  size: number;
  modrinthProjectId?: string;
  schematicSource?: "litematica" | "worldedit";
}

/** "Guardar": pick one of your instances and a type, see everything it has,
 *  save what you want to the library. */
function InstanceBrowser({
  instances,
  onClose,
}: {
  instances: { id: string; name: string }[];
  onClose: () => void;
}) {
  const saved = usePersonalLibrary((s) => s.content);
  const [instanceId, setInstanceId] = useState<string>(instances[0]?.id ?? "");
  const [category, setCategory] = useState<SavedContentCategory>("mods");
  const [items, setItems] = useState<BrowseItem[] | null>(null);
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const instance = instances.find((i) => i.id === instanceId);

  useEffect(() => {
    if (!instanceId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setItems(null);
    (async (): Promise<BrowseItem[]> => {
      if (category === "emotes") {
        return (await listEmotes(instanceId)).map((e) => ({
          path: `emotes/${e.fileName}`,
          fileName: e.fileName,
          displayName: e.displayName,
          iconUrl: e.thumbnailBase64 ? `data:image/png;base64,${e.thumbnailBase64}` : null,
          sha1: e.sha1,
          size: 0,
        }));
      }
      if (category === "schematics") {
        return (await listSchematics(instanceId)).map((s) => ({
          path: s.path,
          fileName: baseName(s.path),
          displayName: baseName(s.path),
          iconUrl: null,
          sha1: s.sha1,
          size: s.size,
          schematicSource: s.source,
        }));
      }
      const files = (await listInstanceFiles(instanceId)).filter((f) => categoryOf(f.path) === category);
      const toIdentify = files.map((f) => ({ path: f.path, sha1: f.sha1 ?? undefined }));
      const [modrinth, group] = await Promise.all([
        identifyModrinthFiles(toIdentify).catch(() => new Map()),
        identifyLibraryFiles(toIdentify),
      ]);
      // Group-library mods aren't on Modrinth; Modrinth wins if both match.
      const matches = new Map([...group, ...modrinth]);
      return files.map((f) => {
        const m = matches.get(f.path);
        return {
          path: f.path,
          fileName: baseName(f.path),
          displayName: m?.title ?? guessTitle(baseName(f.path)),
          iconUrl: m?.iconUrl ?? null,
          sha1: f.sha1,
          size: f.size,
          modrinthProjectId: m?.projectId,
        };
      });
    })()
      .then((list) => !cancelled && setItems(list.sort((a, b) => a.displayName.localeCompare(b.displayName))))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [instanceId, category]);

  const savedHashes = useMemo(
    () => new Set(saved.filter((s) => s.category === category && !s.reference).map((s) => s.sha1)),
    [saved, category]
  );
  const savedRefs = useMemo(
    () => new Set(saved.filter((s) => s.category === category && s.reference).map((s) => s.modrinthProjectId)),
    [saved, category]
  );

  const save = async (item: BrowseItem) => {
    if (!instance) return;
    setSavingPath(item.path);
    try {
      const { alreadySaved } = await saveContent(
        {
          category,
          displayName: item.displayName,
          iconUrl: item.iconUrl,
          modrinthProjectId: item.modrinthProjectId,
          schematicSource: item.schematicSource,
          sourceName: instance.name,
        },
        item.fileName,
        { kind: "instance", modpackId: instance.id, path: item.path }
      );
      toast.success(alreadySaved ? "Ya estaba en tu biblioteca." : `${item.displayName} guardado.`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar.");
    } finally {
      setSavingPath(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 shrink-0">
        <Select value={instanceId} onValueChange={setInstanceId}>
          <SelectTrigger className="h-7 flex-1 min-w-0 text-xs bg-white/[0.07] border-transparent">
            <SelectValue placeholder="Elige una instancia" />
          </SelectTrigger>
          <SelectContent>
            {instances.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(v) => setCategory(v as SavedContentCategory)}>
          <SelectTrigger className="h-7 w-[8.5rem] text-xs bg-white/[0.07] border-transparent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {SAVED_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Hint label="Volver a lo guardado">
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </Hint>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {instances.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No tienes ninguna instancia instalada.</p>
        ) : items === null ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Esta instancia no tiene {SAVED_CATEGORY_LABELS[category].toLowerCase()}.</p>
        ) : (
          items.map((item) => {
            const isSaved =
              (!!item.sha1 && savedHashes.has(item.sha1)) || (!!item.modrinthProjectId && savedRefs.has(item.modrinthProjectId));
            return (
              <div key={item.path} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md bg-white/[0.07] border border-transparent">
                <ItemIcon iconUrl={item.iconUrl} category={category} className="h-8 w-8" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-100 truncate">{item.displayName}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {item.fileName}
                    {item.size > 0 && ` · ${formatBytes(item.size)}`}
                  </p>
                </div>
                {isSaved ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-accent shrink-0">
                    <Check className="h-3.5 w-3.5" /> Guardado
                  </span>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs shrink-0 border-white/10" disabled={savingPath === item.path} onClick={() => save(item)}>
                    {savingPath === item.path ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function GalleryTab() {
  const gallery = usePersonalLibrary((s) => s.gallery);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);
  const [lightboxLoading, setLightboxLoading] = useState(false);
  const [shareImage, setShareImage] = useState<ShareableImage | null>(null);

  // Which image is open (by id: file names can repeat), for prev/next; the
  // token keeps a slow read from overwriting a later one when moving quickly.
  const [openId, setOpenId] = useState<string | null>(null);
  const loadToken = useRef(0);
  const open = async (id: string, title: string, thumb: string | null) => {
    const token = ++loadToken.current;
    setOpenId(id);
    setLightbox({ src: thumb ?? "", title });
    setLightboxLoading(true);
    try {
      const base64 = await readGalleryImage(id);
      if (token !== loadToken.current) return;
      setLightbox({ src: `data:image/png;base64,${base64}`, title });
    } catch {
      if (token !== loadToken.current) return;
      toast.error("No se pudo abrir la imagen.");
      setLightbox(null);
    } finally {
      if (token === loadToken.current) setLightboxLoading(false);
    }
  };
  const openIndex = lightbox && openId ? gallery.findIndex((g) => g.id === openId) : -1;
  const openAt = (i: number) => {
    const img = gallery[i];
    if (img) open(img.id, img.fileName, img.thumbnailDataUrl);
  };
  const nav: LightboxNav | null =
    openIndex >= 0 && gallery.length > 1
      ? { index: openIndex, total: gallery.length, onPrev: () => openAt(openIndex - 1), onNext: () => openAt(openIndex + 1) }
      : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex items-center justify-between shrink-0">
        <p className="text-[11px] text-muted-foreground">
          {gallery.length} imagen{gallery.length === 1 ? "" : "es"}
        </p>
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs border-white/10" onClick={() => showGalleryFile()}>
          <FolderOpen className="mr-1 h-3.5 w-3.5" /> Abrir carpeta
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {gallery.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 px-4">
            Aquí aparecen las capturas que añadas desde una instancia (Capturas → ⋮ → Agregar a la galería) y las que te envíen por el chat.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {gallery.map((img) => (
              <div key={img.id} className="group relative">
                <button
                  type="button"
                  onClick={() => open(img.id, img.fileName, img.thumbnailDataUrl)}
                  className="w-full aspect-video rounded-md overflow-hidden bg-black/30 border border-white/10 hover:border-white/25 transition-colors"
                >
                  {img.thumbnailDataUrl ? (
                    <img src={img.thumbnailDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5 m-auto text-muted-foreground" />
                  )}
                </button>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={img.fileName}>
                  {img.from.kind === "chat" ? `De ${img.from.username}` : img.from.name}
                </p>
                <DropdownMenu>
                  <Hint label="Opciones de la imagen">
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="absolute top-1 right-1 h-6 w-6 flex items-center justify-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-black/80 transition-opacity"
                        aria-label="Opciones de la imagen"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                  </Hint>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => showGalleryFile(img.id)}>
                      <FolderOpen className="mr-2 h-4 w-4" /> Abrir carpeta
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        setShareImage({
                          fileName: img.fileName,
                          sha1: img.sha1,
                          size: img.size,
                          thumbnailDataUrl: img.thumbnailDataUrl,
                          readBase64: () => readGalleryImage(img.id),
                        })
                      }
                    >
                      <Send className="mr-2 h-4 w-4" /> Compartir imagen
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => removeFromGallery(img.id).catch(() => toast.error("No se pudo quitar."))}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Quitar de la galería
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>
      <ImageLightbox
        image={lightbox}
        loading={lightboxLoading}
        nav={nav}
        onClose={() => {
          loadToken.current++;
          setLightbox(null);
          setLightboxLoading(false);
        }}
      />
      <ShareImageDialog image={shareImage} onOpenChange={(o) => !o && setShareImage(null)} />
    </div>
  );
}
