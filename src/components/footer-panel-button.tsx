import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Footer button (same 38px look as Contenido) that opens a side panel —
 *  Participantes, Novedades — as a popover above it. Used on the online
 *  instance page (narrow window) and in Inicio's carousel. */
export function FooterPanelButton({
  icon: Icon,
  label,
  labelClassName,
  children,
}: {
  icon: LucideIcon;
  label: string;
  /** e.g. hide the label on narrow windows (it stays as the tooltip). */
  labelClassName?: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          className="h-[38px] flex items-center gap-2 px-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-gray-200 data-[state=open]:border-accent data-[state=open]:bg-accent/15"
        >
          <Icon className="h-4 w-4" />
          <span className={cn("text-sm font-medium", labelClassName)}>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={10} className="w-80 max-h-[min(28rem,70vh)] flex flex-col p-0 border-0 bg-card/95">
        {children}
      </PopoverContent>
    </Popover>
  );
}
