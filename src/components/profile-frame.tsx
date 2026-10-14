import type { ReactNode } from "react";
import { ElectricBorder } from "@/components/electric-border";
import { TracedBorder } from "@/components/traced-border";

/** The animated border around a profile card, chosen from decoration-catalog's
 *  FRAME_DECORATIONS. "none" just renders the card as-is. */
export function ProfileFrame({
  frame,
  borderRadius = 12,
  children,
}: {
  frame: string | undefined;
  /** Match the wrapped card's corners (px). */
  borderRadius?: number;
  children: ReactNode;
}) {
  if (frame === "electric") {
    return (
      <ElectricBorder borderRadius={borderRadius} color="#ff9436" chaos={0.09} speed={0.9}>
        {children}
      </ElectricBorder>
    );
  }
  if (frame === "traced") {
    return <TracedBorder borderRadius={borderRadius}>{children}</TracedBorder>;
  }
  return <>{children}</>;
}
