import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Library, Loader2, Package, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LoaderIcon } from "@/components/loader-icon";
import { ModLibraryEditorDialog } from "@/components/mod-library-editor-dialog";
import {
  LIBRARY_LOADER_LABELS,
  isModLibraryOwner,
  subscribeLibraryMods,
  type LibraryBuild,
  type LibraryMod,
} from "@/services/mod-library";

/** "1.21.1: Fabric, Forge" lines for a mod card, newest version first. */
function summarizeBuilds(builds: LibraryBuild[]): { mcVersion: string; loaders: LibraryBuild["loader"][] }[] {
  const byVersion = new Map<string, LibraryBuild[]>();
  for (const b of builds) byVersion.set(b.mcVersion, [...(byVersion.get(b.mcVersion) ?? []), b]);
  return Array.from(byVersion.entries())
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .map(([mcVersion, list]) => ({ mcVersion, loaders: list.map((b) => b.loader) }));
}

/** Admin → Biblioteca de mods: the group's own mods, only for the library owner. */
export default function AdminLibrary() {
  const { isAuthenticated, email, username } = useAuth();
  const isOwner = isModLibraryOwner(email);
  const [, setLocation] = useLocation();

  const [mods, setMods] = useState<LibraryMod[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // null while creating a new mod; the editor then gets the live mod by id.
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
    else if (!isOwner) setLocation("/admin");
  }, [isAuthenticated, isOwner, setLocation]);

  useEffect(() => {
    if (!isOwner) return;
    return subscribeLibraryMods(setMods, () => setMods([]));
  }, [isOwner]);

  const editingMod = useMemo(
    () => (editingId ? mods?.find((m) => m.id === editingId) ?? null : null),
    [editingId, mods]
  );

  // The mod was deleted (here or elsewhere) while its editor was open.
  useEffect(() => {
    if (editorOpen && editingId && mods && !mods.some((m) => m.id === editingId)) setEditorOpen(false);
  }, [editorOpen, editingId, mods]);

  if (!isOwner) return null;

  return (
    <div className="relative h-full overflow-hidden bg-background text-foreground flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-5 px-6 pt-6 pb-6 max-w-5xl mx-auto w-full">
          <div className="relative shrink-0 rounded-xl border border-white/10 bg-card/40 p-5 overflow-hidden">
            <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLocation("/admin")}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Volver"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold leading-tight">Biblioteca de mods</h1>
                <p className="text-xs text-muted-foreground">
                  {mods === null ? "Cargando…" : `${mods.length} mod${mods.length === 1 ? "" : "s"} propio${mods.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <Button
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold shrink-0"
                onClick={() => {
                  setEditingId(null);
                  setEditorOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Subir mod
              </Button>
            </div>
          </div>

          {mods === null ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando biblioteca…
            </div>
          ) : mods.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Library className="h-7 w-7 opacity-60" />
              <p className="text-sm">Todavía no hay mods en la biblioteca.</p>
              <p className="text-xs">Sube el primero con "Subir mod".</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {mods.map((mod) => {
                const summary = summarizeBuilds(Object.values(mod.builds));
                return (
                  <div
                    key={mod.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setEditingId(mod.id);
                      setEditorOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setEditingId(mod.id);
                        setEditorOpen(true);
                      }
                    }}
                    className="flex items-center gap-4 rounded-xl border border-white/10 bg-card/40 hover:bg-card/60 hover:border-white/20 transition-colors cursor-pointer p-4"
                  >
                    {mod.icon ? (
                      <img src={mod.icon} alt="" className="h-14 w-14 rounded-lg object-cover bg-black/50 shrink-0" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-black/50 shrink-0 flex items-center justify-center">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-white truncate">{mod.name}</h3>
                      {mod.description && <p className="text-xs text-muted-foreground truncate">{mod.description}</p>}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {summary.length === 0 ? (
                          <span className="text-[11px] text-yellow-400">Sin archivos subidos</span>
                        ) : (
                          summary.map(({ mcVersion, loaders }) => (
                            <span
                              key={mcVersion}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px]"
                            >
                              {mcVersion}
                              {loaders.map((l) => (
                                <LoaderIcon key={l} loader={l} className="h-3 w-3" title={LIBRARY_LOADER_LABELS[l]} />
                              ))}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ModLibraryEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mod={editingMod}
        author={username ?? ""}
        onCreated={(id) => setEditingId(id)}
      />
    </div>
  );
}
