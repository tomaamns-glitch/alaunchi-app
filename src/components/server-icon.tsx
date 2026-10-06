import { Server } from "lucide-react";
import { useServerIcon } from "@/hooks/use-server-icon";
import { cn } from "@/lib/utils";

/** A server's logo (its favicon from a status ping), or a generic icon. */
export function ServerIcon({ ip, className, iconClassName }: { ip: string; className?: string; iconClassName?: string }) {
  const favicon = useServerIcon(ip);
  return favicon ? (
    <img
      src={favicon}
      alt=""
      draggable={false}
      className={cn("shrink-0 rounded-md object-cover", className)}
      style={{ imageRendering: "pixelated" }}
    />
  ) : (
    <span className={cn("shrink-0 flex items-center justify-center rounded-md bg-accent/15 text-accent", className)}>
      <Server className={cn("h-4 w-4", iconClassName)} />
    </span>
  );
}
