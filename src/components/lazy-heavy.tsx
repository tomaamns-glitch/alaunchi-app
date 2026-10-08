import { lazy, Suspense, type ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import type { SkinViewerAnimated as SkinViewerAnimatedImpl } from "@/components/skin-viewer-animated";
import type { SkinManagerPanel as SkinManagerPanelImpl } from "@/components/skin-manager-panel";
import type { ChatContentPicker as ChatContentPickerImpl } from "@/components/chat-content-picker";
import type { ProfileCustomizeDialog as ProfileCustomizeDialogImpl } from "@/components/profile-customize-dialog";

// Rendimiento: these pull in three.js (+ skin models, particle effects, emote
// players), yet they're rendered by components that are on screen from the
// first frame (account menu, chat, profile panels) while only being *shown*
// when a panel opens. Loading them on demand keeps three.js out of the startup
// bundle; prefetchHeavyChunks() then fetches them in the background once the
// app is idle, so opening a panel doesn't wait for anything. Same props, same
// behavior — the fallbacks only keep the layout while a chunk is arriving.

const loadSkinViewerAnimated = () => import("@/components/skin-viewer-animated");
const loadSkinManagerPanel = () => import("@/components/skin-manager-panel");
const loadChatContentPicker = () => import("@/components/chat-content-picker");
const loadProfileCustomizeDialog = () => import("@/components/profile-customize-dialog");

const SkinViewerAnimatedLazy = lazy(() => loadSkinViewerAnimated().then((m) => ({ default: m.SkinViewerAnimated })));
const SkinManagerPanelLazy = lazy(() => loadSkinManagerPanel().then((m) => ({ default: m.SkinManagerPanel })));
const ChatContentPickerLazy = lazy(() => loadChatContentPicker().then((m) => ({ default: m.ChatContentPicker })));
const ProfileCustomizeDialogLazy = lazy(() =>
  loadProfileCustomizeDialog().then((m) => ({ default: m.ProfileCustomizeDialog }))
);

export function SkinViewerAnimated(props: ComponentProps<typeof SkinViewerAnimatedImpl>) {
  const { width = 150, height = 210 } = props;
  return (
    <Suspense fallback={<div className={props.className} style={{ width, height }} />}>
      <SkinViewerAnimatedLazy {...props} />
    </Suspense>
  );
}

export function SkinManagerPanel(props: ComponentProps<typeof SkinManagerPanelImpl>) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <SkinManagerPanelLazy {...props} />
    </Suspense>
  );
}

export function ChatContentPicker(props: ComponentProps<typeof ChatContentPickerImpl>) {
  return (
    <Suspense fallback={null}>
      <ChatContentPickerLazy {...props} />
    </Suspense>
  );
}

export function ProfileCustomizeDialog(props: ComponentProps<typeof ProfileCustomizeDialogImpl>) {
  return (
    <Suspense fallback={null}>
      <ProfileCustomizeDialogLazy {...props} />
    </Suspense>
  );
}

/** Background-fetches the chunks above (call once the app has settled). */
export function prefetchHeavyChunks(): void {
  for (const load of [loadSkinViewerAnimated, loadSkinManagerPanel, loadChatContentPicker, loadProfileCustomizeDialog]) {
    load().catch(() => {});
  }
}
