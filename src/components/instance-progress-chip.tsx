import type { CSSProperties } from "react";
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

/**
 * main's phase label as the chip's bold verb + the rest: "Descargando" ·
 * "Minecraft 1.20.1 · 42 %". The % is the phase's own; with no measure the
 * text ends in "…" instead. (The fill is the whole operation's progress.)
 */
function splitLabel(label: string, phaseProgress: number | null | undefined) {
  const space = label.indexOf(" ");
  const name = space === -1 ? label : label.slice(0, space);
  const rest = space === -1 ? "" : label.slice(space + 1);
  if (typeof phaseProgress === "number") {
    return { name, argument: [rest, `${Math.round(phaseProgress * 100)} %`].filter(Boolean).join(" · ") };
  }
  return rest ? { name, argument: `${rest}…` } : { name: `${name}…`, argument: "" };
}

function describe(entry: InstanceProgress | undefined, runState: InstanceRunState, installed: boolean, online: boolean) {
  if (runState === "stopping") return { icon: <Square className="fill-current" />, name: "Cerrando", argument: "Minecraft", progress: null };
  if (entry?.label && entry.stage !== "error") {
    const icon = entry.kind === "launch" ? <Play className="fill-current" /> : installed ? <RefreshCw /> : <Download />;
    return { icon, ...splitLabel(entry.label, entry.phaseProgress), progress: entry.progress };
  }
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
  style,
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
  /** E.g. a per-corner border radius when the chip stands in for two buttons. */
  style?: CSSProperties;
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
      style={style}
    />
  );
}
