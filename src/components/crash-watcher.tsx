import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Stethoscope } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { onInstanceCrashed, type InstanceCrashEvent } from "@/services/electron";
import { CRASHES_BEFORE_ASKING, openCrashDiagnosis, useCrashDiagnosis } from "@/lib/crash-diagnosis";

// Only loaded once someone actually opens a diagnosis.
const CrashDiagnosisDialog = lazy(() => import("@/components/crash-diagnosis-dialog"));

/** Streaks the player already said "no" to (one question per run of crashes). */
const DISMISSED_KEY = "alaunchi_crash_prompt_dismissed";

function readDismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function dismissStreak(key: string) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...readDismissed(), key].slice(-50)));
  } catch {}
}

/**
 * Mounted once in App.tsx. Each crash (main's "instance:crashed", at the end of
 * a session) shows a toast with "Diagnosticar"; from the 3rd in a row it asks
 * outright, once per streak. Also hosts the diagnosis dialog for the whole app
 * (openCrashDiagnosis, e.g. from the instance manager's ⋮ menu).
 */
export function CrashWatcher() {
  const [ask, setAsk] = useState<InstanceCrashEvent | null>(null);
  const target = useCrashDiagnosis((s) => s.target);

  useEffect(
    () =>
      onInstanceCrashed((e) => {
        const diagnose = () => openCrashDiagnosis({ modpackId: e.modpackId, name: e.name });
        const streakKey = `${e.modpackId}:${e.streakStartedAt}`;
        if (e.consecutive >= CRASHES_BEFORE_ASKING && !readDismissed().includes(streakKey)) {
          setAsk(e);
          return;
        }
        toast.error(`${e.name} se ha cerrado por un error`, {
          description: e.lastDescription || e.lastReason,
          action: { label: "Diagnosticar", onClick: diagnose },
          duration: 10000,
        });
      }),
    []
  );

  return (
    <>
      <AlertDialog open={!!ask} onOpenChange={(open) => !open && setAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-accent" />
              {ask?.name} ha crasheado {ask?.consecutive} veces seguidas
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ask?.lastDescription || ask?.lastReason}. ¿Quieres que ALaunchi revise los informes de error, los mods y los
              archivos de la instancia para buscar la causa? No se cambia nada sin que lo confirmes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (ask) dismissStreak(`${ask.modpackId}:${ask.streakStartedAt}`);
              }}
            >
              Ahora no
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (ask) {
                  dismissStreak(`${ask.modpackId}:${ask.streakStartedAt}`);
                  openCrashDiagnosis({ modpackId: ask.modpackId, name: ask.name });
                }
              }}
            >
              Hacer diagnóstico
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {target && (
        <Suspense fallback={null}>
          <CrashDiagnosisDialog key={target.modpackId} target={target} />
        </Suspense>
      )}
    </>
  );
}
