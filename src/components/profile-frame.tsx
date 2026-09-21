import type { ReactNode } from "react";
import { ElectricBorder } from "@/components/electric-border";

/** The animated border around a profile card, chosen from decoration-catalog's
 *  FRAME_DECORATIONS. "none" just renders the card as-is. */
export function ProfileFrame({ frame, children }: { frame: string | undefined; children: ReactNode }) {
  if (frame === "electric") {
    return (
      <ElectricBorder borderRadius={12} color="#ff9436" chaos={0.09} speed={0.9}>
        {children}
      </ElectricBorder>
    );
  }
  return <>{children}</>;
}
