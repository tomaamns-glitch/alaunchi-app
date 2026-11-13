import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { ensureFirebaseSession } from "@/services/firebase-session";

/**
 * Player reports — client side of functions/src/reports.ts. Sending goes
 * through submitReport (which attaches the conversation's last messages
 * itself); only the moderator (lib/moderation.ts) can list and resolve them,
 * from Admin → Reportes. Nothing here touches the database directly: reports/
 * is closed to clients.
 */

export type ReportReason = "harassment" | "inappropriate" | "spam" | "cheating" | "other";
export type ReportStatus = "open" | "resolved" | "dismissed";

export const REPORT_REASONS: { id: ReportReason; label: string; hint: string }[] = [
  { id: "harassment", label: "Acoso o insultos", hint: "Mensajes ofensivos, amenazas o acoso." },
  { id: "inappropriate", label: "Contenido inapropiado", hint: "Imágenes, archivos o textos que no deberían estar aquí." },
  { id: "spam", label: "Spam", hint: "Mensajes repetidos, publicidad o enlaces sospechosos." },
  { id: "cheating", label: "Trampas", hint: "Hacks, xray u otras trampas en las instancias." },
  { id: "other", label: "Otro motivo", hint: "Cuéntalo en el comentario." },
];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.id, r.label])
) as Record<ReportReason, string>;

export interface ReportMessage {
  senderUuid: string;
  text: string;
  attachment?: string;
  timestamp: number;
}

export interface Report {
  id: string;
  reporterUuid: string;
  reporterName: string;
  targetUuid: string;
  targetName: string;
  reason: ReportReason;
  comment: string;
  source: "chat" | "profile";
  messages?: ReportMessage[];
  status: ReportStatus;
  createdAt: number;
  note?: string;
  reviewedAt?: number;
}

/** The callable's error message, readable for a toast. */
function message(e: any, fallback: string): string {
  if (e?.code === "functions/unauthenticated") return "No se pudo iniciar sesión en el servidor de ALaunchi. Inténtalo de nuevo en un momento.";
  return typeof e?.message === "string" && e.message && !/^(internal|INTERNAL)$/.test(e.message) ? e.message : fallback;
}

export async function submitReport(input: {
  targetUuid: string;
  targetName: string;
  reporterName: string;
  reason: ReportReason;
  comment: string;
  source: "chat" | "profile";
}): Promise<void> {
  await ensureFirebaseSession();
  try {
    await httpsCallable(functions, "submitReport")(input);
  } catch (e) {
    throw new Error(message(e, "No se pudo enviar el reporte."));
  }
}

export async function listReports(): Promise<Report[]> {
  await ensureFirebaseSession();
  try {
    const { data } = await httpsCallable<void, { reports: Report[] }>(functions, "listReports")();
    return data.reports;
  } catch (e) {
    throw new Error(message(e, "No se pudieron cargar los reportes."));
  }
}

export async function setReportStatus(id: string, status: ReportStatus, note?: string): Promise<void> {
  await ensureFirebaseSession();
  try {
    await httpsCallable(functions, "setReportStatus")({ id, status, note: note ?? "" });
  } catch (e) {
    throw new Error(message(e, "No se pudo actualizar el reporte."));
  }
}
