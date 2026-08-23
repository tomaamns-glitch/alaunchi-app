import { reportError as sendErrorReport } from "./github";
import { getAppVersion, isElectron, onAppError } from "./electron";
import { getGithubRepo } from "@/lib/app-config";

const reportedKeys = new Set<string>();
let appVersion = "";

async function send(context: string, message: string, stack?: string) {
  // Only report in the packaged app — during dev every reload/HMR error would
  // otherwise open a real issue in the repo.
  if (!import.meta.env.PROD) return;

  const key = `${message}::${(stack || "").slice(0, 300)}`;
  if (reportedKeys.has(key)) return;
  reportedKeys.add(key);

  const repoUrl = getGithubRepo();
  const token = localStorage.getItem("githubToken") ?? "";
  if (!repoUrl || !token) return;

  await sendErrorReport(repoUrl, token, {
    context,
    message,
    stack,
    appVersion: appVersion || undefined,
    platform: `${navigator.platform} — ${navigator.userAgent}`,
  });
}

/** Call once at startup. Wires up automatic crash reporting for the whole app. */
export function initErrorReporter() {
  getAppVersion()
    .then((v) => {
      appVersion = v;
    })
    .catch(() => {});

  window.addEventListener("error", (event) => {
    send("renderer:window.onerror", event.message, event.error?.stack);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    send("renderer:unhandledrejection", message, stack);
  });

  if (isElectron) {
    onAppError((data) => {
      send(data.context, data.message, data.stack ?? undefined);
    });
  }
}

/** Called from the React error boundary — a render crash never reaches window.onerror. */
export function reportRenderError(error: Error, componentStack?: string) {
  void send("renderer:react", error.message, componentStack ? `${error.stack}\n\n${componentStack}` : error.stack);
}
