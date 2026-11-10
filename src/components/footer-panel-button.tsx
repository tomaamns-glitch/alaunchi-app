import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoveToContentMenu } from "@/components/move-to-content-menu";
import { cn } from "@/lib/utils";

/** Footer button (same 38px look as Contenido) that opens a side panel —
 *  Participantes, Novedades — as a popover above it. Used on the online
 *  instance page (narrow window) and in Inicio's carousel. */
export function FooterPanelButton({
  icon: Icon,
  label,
  iconOnly = false,
  onMoveToContent,
  tourId,
  children,
}: {
  icon: LucideIcon;
  label: string;
  /** A 38px square with just the icon; hovering (or having it open) slides the label out. */
  iconOnly?: boolean;
  /** Adds "Mover a Contenido" on right click. */
  onMoveToContent?: () => void;
  /** data-tour anchor for the walkthroughs. */
  tourId?: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <MoveToContentMenu onMove={onMoveToContent}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-tour={tourId}
            className={cn(
              "group h-[38px] flex items-center rounded-md bg-white/[0.07] backdrop-blur-md border border-transparent hover:bg-white/[0.14] transition-colors text-gray-200 data-[state=open]:border-accent data-[state=open]:bg-accent/15",
              iconOnly ? "px-[10px]" : "gap-2 px-3"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {iconOnly ? <HoverLabel>{label}</HoverLabel> : <span className="text-sm font-medium">{label}</span>}
          </button>
        </PopoverTrigger>
      </MoveToContentMenu>
      <PopoverContent side="top" align="end" sideOffset={10} className="w-80 max-h-[min(28rem,70vh)] flex flex-col p-0 rounded-md border-transparent bg-background/60 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Label of an icon-only footer button (38px square: 1px border + 10px padding
 *  + 16px icon): hidden at rest, slides out while the button (`group`) is
 *  hovered, focused or open. */
export function HoverLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        "max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-200 ease-out",
        "group-hover:ml-2 group-hover:max-w-[10rem] group-hover:opacity-100",
        "group-focus-visible:ml-2 group-focus-visible:max-w-[10rem] group-focus-visible:opacity-100",
        "group-data-[state=open]:ml-2 group-data-[state=open]:max-w-[10rem] group-data-[state=open]:opacity-100"
      )}
    >
      {children}
    </span>
  );
}
