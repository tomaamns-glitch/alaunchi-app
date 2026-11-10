import { useEffect, useState } from "react";
import { getProjectAuthor, getProjectDetail, type ModrinthProjectDetail } from "@/services/modrinth";
import type { Modpack } from "@/services/github";

const formatDate = (value: string | number) => new Date(value).toLocaleDateString("es-ES", { dateStyle: "medium" });

/** The column under a downloaded instance's logo: who made the pack, which version
 *  is installed, when, and its downloads. CurseForge imports only have what was
 *  saved locally. */
export function DownloadedPackDetails({ pack }: { pack: Modpack }) {
  const projectId = pack.modrinthProjectId;
  const [detail, setDetail] = useState<ModrinthProjectDetail | null>(null);
  const [author, setAuthor] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setAuthor(null);
    if (!projectId) return;
    let cancelled = false;
    getProjectDetail(projectId).then(async (result) => {
      if (cancelled || !result) return;
      setDetail(result);
      const name = await getProjectAuthor(projectId, !!result.organizationId);
      if (!cancelled) setAuthor(name);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const rows: Array<[string, string | undefined | null]> = [
    ["Autor", author],
    ["Versión", pack.modrinthVersionNumber],
    ["Instalada", pack.installedAt ? formatDate(pack.installedAt) : undefined],
    ["Descargas", detail ? detail.downloads.toLocaleString("es-ES") : undefined],
  ];

  return (
    <dl className="space-y-5 rounded-md bg-gray-500/10 backdrop-blur-md border border-transparent p-4 text-sm">
      {rows
        .filter(([, value]) => !!value)
        .map(([label, value]) => (
          <div key={label} className="min-w-0 space-y-1">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-gray-100 font-medium break-words select-text">{value}</dd>
          </div>
        ))}
    </dl>
  );
}
