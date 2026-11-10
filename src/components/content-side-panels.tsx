import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { MessagesSquare, Sparkles, Users, type LucideIcon } from "lucide-react";
import { ChangelogSidePanel } from "@/components/changelog-side-panel";
import { InstanceGroupChatPanel } from "@/components/instance-group-chat";
import { InstanceMembersPanel } from "@/components/instance-members-panel";
import { useOnlinePanels, type ContentLayout, type PanelColumn, type SidePanel } from "@/lib/online-panels";
import { cn } from "@/lib/utils";
import type { Modpack } from "@/services/github";

const LONG_PRESS_MS = 350;
/** Moving further than this before the long press ends means scrolling or selecting text. */
const LONG_PRESS_SLOP_PX = 6;
// Pressing any of these does what it always does, never starts a drag.
const INTERACTIVE = "button, a, input, textarea, select, [role='button'], [role='menu']";

const PANEL_INFO: Record<SidePanel, { label: string; icon: LucideIcon }> = {
  members: { label: "Participantes", icon: Users },
  changelog: { label: "Novedades", icon: Sparkles },
  groupChat: { label: "Chat grupal", icon: MessagesSquare },
};

interface Drag {
  panel: SidePanel;
  x: number;
  y: number;
  column: PanelColumn;
  before: SidePanel | null;
}

/**
 * The blocks beside the instance manager's content (Novedades, plus Participantes
 * and the group chat once moved here). Holding one down picks it up: it can be
 * dropped anywhere in either column; a line shows where. Escape cancels.
 */
export function ContentSidePanels({
  pack,
  myUuid,
  myUsername,
  columns,
  wide,
  styles,
  topClassName,
  onChatOpened,
}: {
  pack: Modpack;
  myUuid: string | null;
  myUsername: string;
  columns: ContentLayout;
  /** There's room for a second column. */
  wide: boolean;
  /** Each column's horizontal position, set by the page's layout. */
  styles: Record<PanelColumn, CSSProperties>;
  topClassName: string;
  /** After opening a private chat from the group chat. */
  onChatOpened: () => void;
}) {
  const collapsed = useOnlinePanels((s) => s.collapsed);
  const toggleCollapsed = useOnlinePanels((s) => s.toggleCollapsed);
  const { setMoved, placePanel } = useOnlinePanels.getState();

  const [drag, setDrag] = useState<Drag | null>(null);
  const columnRefs = useRef<Record<PanelColumn, HTMLDivElement | null>>({ left: null, right: null });
  const stopPress = useRef<(() => void) | null>(null);
  useEffect(() => () => stopPress.current?.(), []);

  /** Which column and above which block the pointer is, not counting the one being dragged. */
  const dropTarget = (panel: SidePanel, x: number, y: number) => {
    const column: PanelColumn = wide && x > window.innerWidth / 2 ? "right" : "left";
    let before: SidePanel | null = null;
    const blocks = columnRefs.current[column]?.querySelectorAll<HTMLElement>("[data-side-panel]") ?? [];
    for (const el of Array.from(blocks)) {
      const id = el.dataset.sidePanel as SidePanel;
      if (id === panel) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        before = id;
        break;
      }
    }
    return { column, before };
  };

  const onPressStart = (panel: SidePanel, e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest(INTERACTIVE)) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let current: Drag | null = null;

    const stop = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", onKey);
      document.body.style.userSelect = "";
      stopPress.current = null;
      setDrag(null);
    };
    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > LONG_PRESS_SLOP_PX) stop();
        return;
      }
      current = { panel, x: ev.clientX, y: ev.clientY, ...dropTarget(panel, ev.clientX, ev.clientY) };
      setDrag(current);
    };
    const onUp = () => {
      if (dragging && current) placePanel(panel, current.column, current.before);
      stop();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") stop();
    };
    const timer = window.setTimeout(() => {
      dragging = true;
      document.body.style.userSelect = "none";
      window.getSelection()?.removeAllRanges();
      current = { panel, x: startX, y: startY, ...dropTarget(panel, startX, startY) };
      setDrag(current);
    }, LONG_PRESS_MS);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", onKey);
    stopPress.current = stop;
  };

  const renderPanel = (panel: SidePanel): ReactNode => {
    const isCollapsed = collapsed.includes(panel);
    const onToggleCollapsed = () => toggleCollapsed(panel);
    if (panel === "members") {
      return (
        <InstanceMembersPanel
          modpackId={pack.id}
          className="min-h-0 border-transparent"
          collapsed={isCollapsed}
          onToggleCollapsed={onToggleCollapsed}
          onMoveBack={() => setMoved("members", false)}
        />
      );
    }
    if (panel === "changelog") {
      return (
        <ChangelogSidePanel
          pack={pack}
          className="min-h-0 border-transparent"
          collapsed={isCollapsed}
          onToggleCollapsed={onToggleCollapsed}
          onMoveBack={() => setMoved("changelog", false)}
        />
      );
    }
    return (
      <InstanceGroupChatPanel
        pack={pack}
        myUuid={myUuid!}
        myUsername={myUsername}
        collapsed={isCollapsed}
        onToggleCollapsed={onToggleCollapsed}
        onMoveBack={() => setMoved("groupChat", false)}
        onChatOpened={onChatOpened}
      />
    );
  };

  const insertLine = <div aria-hidden className="h-1 shrink-0 rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.6)]" />;

  const renderColumn = (column: PanelColumn, widthClassName: string) => {
    const panels = columns[column];
    // An empty column only exists as a place to drop something.
    if (panels.length === 0 && !(drag && (column === "left" || wide))) return null;
    const isTarget = drag?.column === column;
    return (
      <div
        ref={(node) => {
          columnRefs.current[column] = node;
        }}
        className={cn("absolute z-40 bottom-4 flex flex-col gap-4", widthClassName, topClassName)}
        style={styles[column]}
      >
        {panels.length === 0 && (
          <div
            className={cn(
              "h-32 shrink-0 rounded-md border-2 border-dashed flex items-center justify-center text-xs backdrop-blur-md",
              isTarget ? "border-accent text-accent bg-accent/10" : "border-white/15 text-muted-foreground bg-gray-500/10"
            )}
          >
            Suelta aquí
          </div>
        )}
        {panels.map((panel) => {
          const isCollapsed = collapsed.includes(panel);
          return (
            <motion.div
              key={panel}
              layout="position"
              transition={{ duration: 0.2, ease: "easeOut" }}
              data-side-panel={panel}
              onPointerDown={(e) => onPressStart(panel, e)}
              className={cn(
                "flex flex-col",
                isCollapsed ? "shrink-0" : panel === "groupChat" ? "flex-1 min-h-[16rem] [&>aside]:flex-1 [&>aside]:min-h-0" : "min-h-0",
                drag?.panel === panel && "opacity-40"
              )}
            >
              {isTarget && drag?.before === panel && <div className="mb-4">{insertLine}</div>}
              {renderPanel(panel)}
            </motion.div>
          );
        })}
        {isTarget && drag?.before === null && panels.length > 0 && insertLine}
      </div>
    );
  };

  const DragIcon = drag ? PANEL_INFO[drag.panel].icon : null;

  return (
    <>
      {renderColumn("left", "w-72")}
      {renderColumn("right", "w-96")}
      {drag &&
        DragIcon &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] flex items-center gap-2 rounded-md bg-gray-500/30 backdrop-blur-xl px-3 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            style={{ left: drag.x + 12, top: drag.y + 12 }}
          >
            <DragIcon className="h-4 w-4 text-accent" />
            {PANEL_INFO[drag.panel].label}
          </div>,
          document.body
        )}
    </>
  );
}
