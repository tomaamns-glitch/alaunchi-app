import { Download, Play, RefreshCw, Square } from "lucide-react";
import { CallChip } from "@/components/call-chip";
import type { InstanceProgress } from "@/hooks/use-instance-progress";
import type { InstanceRunState } from "@/hooks/use-instance-run-state";
import { cn } from "@/lib/utils";

const LAUNCH_DETAIL: Record<string, string> = {
  preparing: "Preparando",
  downloading_client: "Juego",
  downloading_assets: "Recursos",
  downloading_libraries: "Librerías",
  installing_loader: "Modloader",
  extracting_natives: "Nativos",
  installing_java: "Java",
  launching: "Minecraft",
  launched: "Minecraft",
};

function describe(entry: InstanceProgress | undefined, runState: InstanceRunState, installed: boolean, online: boolean) {
  if (runState === "stopping") return { icon: <Square className="fill-current" />, name: "Cerrando", argument: "Minecraft", progress: null };
  if (entry?.kind === "install") {
    // The percentage only for an online instance's download/update.
    const pct = online && entry.progress !== null ? `${Math.round(entry.progress * 100)}%` : "";
    if (entry.stage === "extracting") return { icon: <Download />, name: "Extrayendo", argument: pct, progress: entry.progress };
    return installed
      ? { icon: <RefreshCw />, name: "Actualizando", argument: pct, progress: entry.progress }
      : { icon: <Download />, name: "Descargando", argument: pct, progress: entry.progress };
  }
  if (entry?.kind === "launch") {
    if (entry.stage === "error") return { icon: <Play className="fill-current" />, name: "Error", argument: entry.error ?? "", progress: entry.progress };
    return {
      icon: <Play className="fill-current" />,
      name: "Abriendo",
      argument: LAUNCH_DETAIL[entry.stage] ?? "",
      progress: entry.progress,
    };
  }
  if (runState === "starting") return { icon: <Play className="fill-current" />, name: "Abriendo", argument: "Minecraft", progress: 0.97 };
  if (runState === "installing") return { icon: installed ? <RefreshCw /> : <Download />, name: installed ? "Actualizando" : "Descargando", argument: "", progress: null };
  return { icon: <Play className="fill-current" />, name: "Preparando", argument: "", progress: null };
}

/**
 * The Call Chip shown in place of an instance's Play button while it's being
 * downloaded, updated or opened (use-instance-progress.ts says when).
 */
export function InstanceProgressChip({
  entry,
  runState,
  status,
  installed,
  online,
  size = 34,
  radius,
  className,
}: {
  entry: InstanceProgress | undefined;
  runState: InstanceRunState;
  status: "running" | "done" | "error";
  installed: boolean;
  /** Online instance (from a creator's repo): shows the download/update percentage. */
  online: boolean;
  size?: number;
  /** Corner radius in px (by default, proportional to the size). */
  radius?: number;
  className?: string;
}) {
  const d = describe(entry, runState, installed, online);
  const name = status === "done" ? (entry?.kind === "install" ? (installed ? "Actualizado" : "Descargado") : "Abierto") : d.name;
  return (
    <CallChip
      icon={d.icon}
      name={name}
      argument={status === "done" ? "" : d.argument}
      status={status}
      progress={d.progress}
      expectedMs={entry?.kind === "install" ? 30000 : 12000}
      startedAt={entry?.startedAt}
      showTimer={false}
      size={size}
      radius={radius ?? Math.round(size * 0.28)}
      color="hsl(var(--foreground))"
      surfaceColor="hsl(var(--card))"
      progressColor="hsl(var(--accent))"
      progressOpacity={0.32}
      washOpacity={0.22}
      className={cn("w-full border border-white/10", className)}
    />
  );
}
