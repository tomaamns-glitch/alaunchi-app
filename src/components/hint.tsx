import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Name of an icon button, shown above it on hover in the app's glass style.
 *  z-[60]: over the account menu (z-50), where most of these live. The child
 *  must accept a ref (a plain <button> or a forwardRef component). */
export function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="z-[60] rounded-md border-transparent bg-background/80 backdrop-blur-xl px-2.5 py-1 text-xs font-medium text-gray-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
